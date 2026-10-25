import { useEffect, useRef, useState } from "react";

// Tuning (level is 0..1, mapped from about -50 dB to -15 dB)
const ON_LEVEL = 0.28; // louder than this counts as speech
const OFF_LEVEL = 0.16; // quieter than this counts as silence
const ON_FRAMES = 2; // must stay loud this many polls before "speaking" turns on
const HOLD_MS = 450; // keep "speaking" on through short pauses between words
const POLL_MS = 50;

/**
 * Watches the audio of a MediaStream and reports whether someone is talking.
 *
 *  - isSpeaking : boolean state (changes rarely, safe to render with)
 *  - levelRef   : ref holding the live loudness 0..1 (updated ~20x/second,
 *                 NOT state, so reading it never causes re-renders)
 */
export function useSpeakingDetector(stream) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const levelRef = useRef(0);

  useEffect(() => {
    levelRef.current = 0;
    setIsSpeaking(false);

    const audioTracks = stream
      ? stream.getAudioTracks().filter((t) => t.readyState === "live")
      : [];
    if (audioTracks.length === 0) return undefined;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return undefined;

    let ctx;
    try {
      ctx = new AudioCtx();
    } catch {
      return undefined;
    }

    const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;

    // IMPORTANT: only connect to the analyser, never to ctx.destination.
    // Playback is handled by <RemoteAudio/>; connecting here would double the sound.
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let speaking = false;
    let loudFrames = 0;
    let lastLoudAt = 0;

    const resume = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    resume();
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const level = Math.min(1, Math.max(0, (db + 50) / 35));
      levelRef.current = level;

      const now = performance.now();

      if (!speaking) {
        loudFrames = level >= ON_LEVEL ? loudFrames + 1 : 0;
        if (loudFrames >= ON_FRAMES) {
          speaking = true;
          lastLoudAt = now;
          setIsSpeaking(true);
        }
      } else if (level >= OFF_LEVEL) {
        lastLoudAt = now;
      } else if (now - lastLoudAt > HOLD_MS) {
        speaking = false;
        loudFrames = 0;
        levelRef.current = 0;
        setIsSpeaking(false);
      }
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", resume);
      document.removeEventListener("keydown", resume);
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      ctx.close().catch(() => {});
      levelRef.current = 0;
    };
  }, [stream]);

  return { isSpeaking, levelRef };
}
