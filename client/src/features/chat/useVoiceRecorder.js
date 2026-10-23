import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================================
 * useVoiceRecorder: a React hook that records microphone audio.
 *
 * THE BIG PICTURE
 * ---------------
 * The recorder lives in one of three states:
 *
 *        RECORDING  <──── resume() ────  PAUSED
 *            │  └──────── pause() ───────►  │
 *            │                              │
 *            └────── stop() / cap ──────────┴──►  STOPPED (mic released)
 *
 * Browser APIs used:
 *   - getUserMedia   : asks the user for microphone access → gives a MediaStream
 *   - MediaRecorder  : turns that stream into audio chunks (Blobs)
 *   - AudioContext + AnalyserNode : reads live volume for the animated bars
 *
 * WHY SO MANY useRef's?
 *   State (useState) re-renders the component whenever it changes. Things like
 *   the MediaRecorder object, timer ids, or audio chunks must survive between
 *   renders but should NOT cause a re-render, so they live in refs.
 * ========================================================================== */

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 Constants and format picker
// ─────────────────────────────────────────────────────────────────────────────

// How many volume bars the UI draws. `levels` always has exactly this many items.
export const BAR_COUNT = 18;

// Maximum recording length in seconds (5 minutes).
export const MAX_SECONDS = 300;

// Browsers support different audio formats, so we list our favourites in
// order of preference and pick the first one the current browser supports.
//   Chrome/Firefox/Edge → webm or ogg with the Opus codec
//   Safari              → mp4 (AAC)
// `ext` is the file extension used later when naming the uploaded file.
const FORMATS = [
  { mime: "audio/webm;codecs=opus", ext: "weba" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm", ext: "weba" },
];

// Returns the first supported format. If nothing matches, an empty mime string
// tells MediaRecorder "just use your own default".
function pickFormat() {
  return (
    FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) || {
      mime: "",
      ext: "weba",
    }
  );
}

/**
 * @param {{ maxSeconds?: number, onMaxReached?: (snapshot: object|null) => void }} options
 *
 * When the time limit is hit the recorder is STOPPED and the mic released
 * (nothing can be resumed past the cap). onMaxReached receives the final
 * { blob, duration, mimeType, ext } (or null) so the UI can show a preview.
 *
 * The `= {}` default lets callers write useVoiceRecorder() with no arguments.
 */
export function useVoiceRecorder({
  maxSeconds = MAX_SECONDS,
  onMaxReached,
} = {}) {
  // ───────────────────────────────────────────────────────────────────────────
  // 1.2 State and refs
  // ───────────────────────────────────────────────────────────────────────────

  // ---- STATE: values the UI displays. Changing them triggers a re-render. ----

  // True while the recorder AND the mic are held, i.e. while recording OR paused.
  // It only becomes false after release(). The UI uses this to know whether
  // "Resume" is still possible (if the mic is gone, it isn't).
  const [isRecording, setIsRecording] = useState(false);

  // True only while paused. Together with isRecording this gives the 3 states:
  //   isRecording=false              → STOPPED
  //   isRecording=true, isPaused=false → RECORDING
  //   isRecording=true, isPaused=true  → PAUSED
  const [isPaused, setIsPaused] = useState(false);

  // Whole seconds shown in the timer (e.g. 75 → "1:15").
  const [seconds, setSeconds] = useState(0);

  // One number (0..1) per volume bar. The lazy initializer `() => ...` runs
  // only once. Bars start at a small idle height of 0.1.
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.1));

  // ---- REFS: values that persist across renders WITHOUT causing re-renders ----

  const streamRef = useRef(null); // the microphone stream
  const recorderRef = useRef(null); // the MediaRecorder object
  const ctxRef = useRef(null); // AudioContext (for the level meter)
  const analyserRef = useRef(null); // AnalyserNode (reads the volume)
  const chunksRef = useRef([]); // recorded audio pieces (arrive ~4x per second)
  const extRef = useRef("weba"); // file extension chosen for this recording
  const rafRef = useRef(null); // requestAnimationFrame id (meter loop)
  const timerRef = useRef(null); // setInterval id (timer loop)

  // "Ticket number" guard. Every start() takes a ticket and release() bumps the
  // counter. If the ticket is outdated when the permission popup finally
  // resolves, we know the user cancelled / the component unmounted meanwhile.
  // This also protects against React StrictMode mounting components twice.
  const startIdRef = useRef(0);

  // ---- Time bookkeeping that survives pause/resume ----
  //
  // We can't just use (now - startTime) because paused time would be counted.
  // Instead:
  //   elapsed = elapsedMsRef (all FINISHED segments) + (now - segmentStartRef)
  //
  // Example: record 10 s → pause (elapsedMsRef = 10000, segmentStartRef = 0)
  //          → wait 2 minutes (still 10000) → resume (segmentStartRef = now)
  //          → elapsed continues from 10 s.
  const elapsedMsRef = useRef(0); // total of all FINISHED segments, in ms
  const segmentStartRef = useRef(0); // start of CURRENT segment (0 = clock stopped)

  // ---- "Latest value" refs ----
  //
  // setInterval is created once and would keep using the props from the render
  // that created it (a "stale closure"). By copying the newest value into a ref
  // on every render, the interval always reads the current value.
  const maxRef = useRef(maxSeconds);
  maxRef.current = maxSeconds;
  const onMaxRef = useRef(onMaxReached);
  onMaxRef.current = onMaxReached;

  // startTimer is defined BEFORE stop(), but needs to call it. We store stop()
  // in this ref after it's defined (see `stopRef.current = stop` below).
  const stopRef = useRef(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Small internal helpers
  // ───────────────────────────────────────────────────────────────────────────

  // Elapsed recording time in ms, never above the cap.
  // While paused segmentStartRef is 0, so `live` is 0 and the value is frozen.
  const getElapsedMs = useCallback(() => {
    const live = segmentStartRef.current
      ? Date.now() - segmentStartRef.current
      : 0;
    return Math.min(elapsedMsRef.current + live, maxRef.current * 1000);
  }, []);

  // Stops the meter animation and the timer. Safe to call repeatedly.
  const stopLoops = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    rafRef.current = timerRef.current = null;
  }, []);

  // Level meter loop (reads the analyser created in start()).
  // Kept as its own function so resume() can restart it after a pause.
  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    // Reusable array that receives the raw waveform samples (0..255 each).
    const buf = new Uint8Array(analyser.fftSize);
    let last = 0; // timestamp of the last bar update (for throttling)

    // `t` is the timestamp requestAnimationFrame gives us (ms).
    const loop = (t) => {
      // Fill `buf` with the current waveform. 128 = silence, 0/255 = loud peaks.
      analyser.getByteTimeDomainData(buf);

      // requestAnimationFrame runs ~60x/second, which is faster than needed.
      // Only update the bars about every 70 ms.
      if (t - last > 70) {
        last = t;

        // This is the RMS (root mean square), the standard loudness measure:
        //  1. center each sample around 0  → (value - 128) / 128 gives -1..+1
        //  2. square it (so negative and positive don't cancel out) and add up
        //  3. divide by the sample count and take the square root
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = (buf[i] - 128) / 128;
          sum += d * d;
        }
        // × 4 boosts quiet speech so the bars move visibly; clamp to max 1.
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);

        // Drop the oldest bar, append the newest → bars scroll left like a
        // live waveform. (Functional update: always based on the latest state.)
        setLevels((prev) => [...prev.slice(1), level]);
      }

      // Schedule the next frame, which keeps the loop running.
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Timer + cap enforcement. Restartable, so resume() can call it again.
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      // Derived from the clock (not "+1 per tick"), so it stays accurate even
      // if the browser throttles timers in a background tab.
      const ms = getElapsedMs();
      setSeconds(Math.floor(ms / 1000));

      // Time limit reached while still recording?
      if (
        ms >= maxRef.current * 1000 &&
        recorderRef.current?.state === "recording"
      ) {
        clearInterval(timerRef.current); // make sure the cap fires only once
        timerRef.current = null;
        // Nothing can be resumed after the cap, so stop for real: this
        // finalizes the audio AND releases the mic. Then tell the UI.
        stopRef.current?.().then((result) => onMaxRef.current?.(result));
      }
    }, 100); // 100 ms keeps the overshoot past the cap below 0.1 s
  }, [getElapsedMs]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1.3 release(): the cleanup function
  // Releases the mic + audio graph. Safe to call many times.
  // ───────────────────────────────────────────────────────────────────────────
  const release = useCallback(() => {
    // Invalidate any start() that is still waiting for the permission popup.
    startIdRef.current++;
    stopLoops();

    // Stopping every track is what turns off the browser's "mic in use" icon.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Close the AudioContext (unless already closed) to free audio resources.
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;

    // Reset the clock so the next recording starts from zero.
    elapsedMsRef.current = 0;
    segmentStartRef.current = 0;

    setIsPaused(false);
    setIsRecording(false);
  }, [stopLoops]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1.4 start(): begin recording
  // ───────────────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    // Step A: support check
    // Old browsers / insecure (non-HTTPS) pages may lack these APIs. We throw an
    // error with a custom `name` so the UI can show a fitting message.
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw Object.assign(new Error("unsupported"), {
        name: "NotSupportedError",
      });
    }

    // Step B: take a ticket (compared again after the await below)
    const id = ++startIdRef.current;

    // Step C: ask for the microphone
    // The browser shows a permission popup; execution WAITS here until the user
    // answers. If they deny, this throws "NotAllowedError".
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // stops speaker sound feeding back into the mic
        noiseSuppression: true, // reduces background noise
        autoGainControl: true, // evens out loud/quiet voices
      },
    });

    // Step D: the stale check
    // Cancelled / unmounted / restarted while the permission prompt was open?
    // Then our ticket is outdated: shut the mic we just received and quit.
    if (id !== startIdRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    // Step E: create the recorder
    const fmt = pickFormat();
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        // Only pass mimeType if we found one (conditional spread trick).
        ...(fmt.mime ? { mimeType: fmt.mime } : {}),
        audioBitsPerSecond: 32000, // 32 kbps: low size, plenty for speech
      });
    } catch (err) {
      // If creating the recorder fails, switch the mic OFF before re-throwing,
      // otherwise the mic would stay on with nobody using it.
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }

    // Step F: collect the data
    chunksRef.current = [];
    extRef.current = fmt.ext;
    // Fires every time the recorder has a new piece of audio ready.
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    // Save to refs so pause/resume/stop/release can reach them later.
    streamRef.current = stream;
    recorderRef.current = recorder;

    // Step G: live volume meter
    // Audio graph:  mic stream → AnalyserNode.
    // The analyser is NOT connected to the speakers, so you never hear yourself
    // (no feedback). `webkitAudioContext` is the old Safari name.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // → 256 samples per read
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;

    // Step H: go!
    elapsedMsRef.current = 0;
    recorder.start(250); // fire ondataavailable every 250 ms (small chunks)
    segmentStartRef.current = Date.now(); // the clock begins
    setSeconds(0);
    setIsPaused(false);
    setIsRecording(true);
    startMeter();
    startTimer();
  }, [startMeter, startTimer]);

  // ───────────────────────────────────────────────────────────────────────────
  // pause(): pause recording AND return a snapshot so the user can listen
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Pauses recording (mic stays open so it can be resumed) and resolves a
   * snapshot { blob, duration, mimeType, ext } of everything recorded so far,
   * or null if nothing was captured.
   */
  const pause = useCallback(
    () =>
      // Returns a Promise because getting the last audio data is asynchronous.
      new Promise((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") return resolve(null);

        if (rec.state === "recording") {
          // ORDER MATTERS: bank the time of the segment that just ended
          // BEFORE zeroing segmentStartRef, or that time would be lost.
          elapsedMsRef.current = getElapsedMs();
          segmentStartRef.current = 0; // clock stopped
          rec.pause(); // freeze MediaRecorder; the mic stream stays open
          stopLoops(); // stop the meter + timer
          setSeconds(Math.floor(elapsedMsRef.current / 1000));
          setIsPaused(true);
        }

        // Builds the snapshot from the chunks collected so far.
        // The `done` flag guarantees it runs only once, because it can be
        // triggered by three different paths below.
        let done = false;
        const build = () => {
          if (done) return;
          done = true;
          const mimeType = (rec.mimeType || "audio/webm").split(";")[0]; // "audio/webm;codecs=opus" → "audio/webm"
          const blob = new Blob(chunksRef.current, { type: mimeType });
          resolve(
            blob.size > 0
              ? {
                  blob,
                  duration: Math.max(
                    1,
                    Math.round(elapsedMsRef.current / 1000),
                  ),
                  mimeType,
                  ext: extRef.current,
                }
              : null, // nothing recorded
          );
        };

        // A paused recorder may still hold up to ~250 ms of unsaved audio.
        // requestData() forces the browser to emit it as a final chunk, so the
        // snapshot includes the very last moments before the pause.
        // Our one-time listener is registered AFTER the ondataavailable handler
        // that pushes the chunk, so chunksRef is complete when build() runs.
        rec.addEventListener("dataavailable", build, { once: true });
        setTimeout(build, 1000); // safety net if the browser never fires it
        try {
          rec.requestData();
        } catch {
          build(); // requestData can throw if the recorder is in a bad state
        }
      }),
    [getElapsedMs, stopLoops],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // resume(): continue the SAME recording after a pause
  // ───────────────────────────────────────────────────────────────────────────
  /** Continues the same recording. Returns false if it can't be resumed. */
  const resume = useCallback(() => {
    const rec = recorderRef.current;

    // Can only resume a recorder that is actually paused.
    if (!rec || rec.state !== "paused") return false;
    // Already at the time limit → nothing left to record.
    if (elapsedMsRef.current >= maxRef.current * 1000) return false;

    stopLoops(); // defensive: never run two loops at once
    rec.resume(); // new chunks are appended to the SAME chunk list, so the
    //               final file is one continuous recording (no stitching)
    segmentStartRef.current = Date.now(); // clock restarts from NOW; the time
    //                                       already banked in elapsedMsRef is kept
    setIsPaused(false);
    startMeter();
    startTimer();
    return true;
  }, [startMeter, startTimer, stopLoops]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1.5 stop(): finish and return the result
  // Resolves { blob, duration, mimeType, ext } or null if nothing was recorded.
  // Works from both the recording and the paused state, and releases the mic.
  // ───────────────────────────────────────────────────────────────────────────
  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") return resolve(null);

        // Duration excludes paused time and is capped (see getElapsedMs).
        const duration = Math.max(1, Math.round(getElapsedMs() / 1000));

        // rec.stop() is ASYNCHRONOUS: the browser flushes the last chunk and
        // only then fires `onstop`. So we do the work inside that handler.
        rec.onstop = () => {
          const mimeType = (rec.mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(chunksRef.current, { type: mimeType }); // glue all chunks into one file
          chunksRef.current = [];
          release(); // turn the mic off
          resolve(
            blob.size > 0
              ? { blob, duration, mimeType, ext: extRef.current }
              : null,
          );
        };
        rec.stop();
      }),
    [release, getElapsedMs],
  );
  // Make stop() reachable from startTimer (defined earlier, see stopRef above).
  stopRef.current = stop;

  // ───────────────────────────────────────────────────────────────────────────
  // 1.6 cancel(): throw everything away
  // ───────────────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      // Remove the handlers FIRST so that stopping the recorder doesn't try to
      // collect or process any data.
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
    }
    chunksRef.current = [];
    release();
  }, [release]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1.7 Unmount cleanup and return
  // ───────────────────────────────────────────────────────────────────────────

  // Returning `release` from the effect makes React call it when the component
  // unmounts. This frees the mic if the user navigates away mid-recording.
  useEffect(() => release, [release]);

  // The hook's public API, i.e. what the component can use.
  return {
    isRecording, // recorder + mic currently held (recording OR paused)
    isPaused, // true only while paused
    seconds, // timer value to display
    levels, // array of 0..1 values for the volume bars
    maxSeconds, // the cap, so the UI can show/compare it
    start, // begin recording (async: waits for permission)
    pause, // pause + get a snapshot to preview
    resume, // continue after a pause
    stop, // finish, release the mic, get the final file data
    cancel, // discard everything
  };
}
