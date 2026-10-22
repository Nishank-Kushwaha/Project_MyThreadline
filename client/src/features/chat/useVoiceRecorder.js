import { useCallback, useEffect, useRef, useState } from "react";

export const BAR_COUNT = 18;

// Order = preference. Chrome/Firefox/Edge → webm/ogg opus, Safari → mp4/aac.
const FORMATS = [
  { mime: "audio/webm;codecs=opus", ext: "weba" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm", ext: "weba" },
];

function pickFormat() {
  return (
    FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) || {
      mime: "",
      ext: "weba",
    }
  );
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(BAR_COUNT).fill(0.1));

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const ctxRef = useRef(null);
  const chunksRef = useRef([]);
  const extRef = useRef("weba");
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const startIdRef = useRef(0); // guards against React StrictMode / unmount races

  // Releases the mic + audio graph. Safe to call many times.
  const release = useCallback(() => {
    startIdRef.current++;
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    rafRef.current = timerRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw Object.assign(new Error("unsupported"), {
        name: "NotSupportedError",
      });
    }
    const id = ++startIdRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // Cancelled / unmounted / restarted while the permission prompt was open
    if (id !== startIdRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const fmt = pickFormat();
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(fmt.mime ? { mimeType: fmt.mime } : {}),
        audioBitsPerSecond: 32000, // plenty for speech
      });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }

    chunksRef.current = [];
    extRef.current = fmt.ext;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    streamRef.current = stream;
    recorderRef.current = recorder;

    // Live level meter (analyser is NOT connected to speakers → no feedback)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let last = 0;

    const loop = (t) => {
      analyser.getByteTimeDomainData(buf);
      if (t - last > 70) {
        last = t;
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = (buf[i] - 128) / 128;
          sum += d * d;
        }
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        setLevels((prev) => [...prev.slice(1), level]);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    recorder.start(250);
    startedAtRef.current = Date.now();
    setSeconds(0);
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(s);
      if (s >= 300 && recorderRef.current?.state === "recording") {
        recorderRef.current.pause(); // or call a callback to auto-stop
      }
    }, 250);
  }, []);

  // Resolves { blob, duration, mimeType, ext } or null if nothing was recorded
  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const rec = recorderRef.current;
        if (!rec || rec.state === "inactive") return resolve(null);

        const duration = Math.max(
          1,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        rec.onstop = () => {
          const mimeType = (rec.mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          release();
          resolve(
            blob.size > 0
              ? { blob, duration, mimeType, ext: extRef.current }
              : null,
          );
        };
        rec.stop();
      }),
    [release],
  );

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
    }
    chunksRef.current = [];
    release();
  }, [release]);

  useEffect(() => release, [release]); // free the mic on unmount

  return { isRecording, seconds, levels, start, stop, cancel };
}
