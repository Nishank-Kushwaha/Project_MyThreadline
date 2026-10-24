import { useRef, useCallback, useEffect } from "react";

/**
 * High-performance, zero-asset Web Audio ringtone synthesizer.
 * Generates incoming ringtones, outgoing ringbacks, and call end beeps
 * using browser-native oscillators without relying on external MP3 downloads.
 */
export function useCallSound() {
  const audioCtxRef = useRef(null);
  const ringIntervalRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Stop any currently playing synthesized tones
  const stopSound = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  // Play a single harmonic beep / chime
  const playTone = useCallback(
    (freq, duration = 0.3, type = "sine", gainVal = 0.15) => {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gain.gain.setValueAtTime(gainVal, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (err) {
        console.warn("[sound] tone play error:", err);
      }
    },
    [getAudioContext],
  );

  // Outgoing Call Ringback Tone (Traditional 440Hz + 480Hz dial-pulse)
  const startOutgoingRingback = useCallback(() => {
    stopSound();

    const ringOnce = () => {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Dual frequency tone
        [440, 480].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime);

          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime + 1.2);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 1.3);
        });
      } catch {
        // Autoplay may be restricted
      }
    };

    ringOnce();
    ringIntervalRef.current = setInterval(ringOnce, 3000);
  }, [getAudioContext, stopSound]);

  // Incoming Call Ringtone (Melodic rhythmic marimba chime)
  const startIncomingRingtone = useCallback(() => {
    stopSound();

    const playMelody = () => {
      const notes = [
        { freq: 523.25, time: 0 },    // C5
        { freq: 659.25, time: 0.12 }, // E5
        { freq: 783.99, time: 0.24 }, // G5
        { freq: 1046.5, time: 0.36 }, // C6
        { freq: 783.99, time: 0.52 }, // G5
        { freq: 1046.5, time: 0.68 }, // C6
      ];

      notes.forEach(({ freq, time }) => {
        setTimeout(() => {
          playTone(freq, 0.22, "triangle", 0.2);
        }, time * 1000);
      });
    };

    playMelody();
    ringIntervalRef.current = setInterval(playMelody, 2200);
  }, [playTone, stopSound]);

  // Call Ended / Busy descending beep
  const playCallEndTone = useCallback(() => {
    stopSound();
    playTone(480, 0.15, "sine", 0.15);
    setTimeout(() => playTone(360, 0.25, "sine", 0.15), 180);
  }, [playTone, stopSound]);

  useEffect(() => {
    return () => {
      stopSound();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopSound]);

  return {
    startOutgoingRingback,
    startIncomingRingtone,
    playCallEndTone,
    stopSound,
  };
}
