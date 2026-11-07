import React, { useEffect, useMemo, useRef } from "react";

// Headless media element managing remote peer audio playback and sink output selection
export function RemoteAudio({ stream, outputDeviceId, onOutputError }) {
  // Element refs
  const audioRef = useRef(null);
  const onOutputErrorRef = useRef(onOutputError);
  onOutputErrorRef.current = onOutputError;

  // Memoized audio-only view extracted from composite media stream
  const audioStream = useMemo(() => {
    if (stream && stream.getAudioTracks().length > 0) {
      return new MediaStream(stream.getAudioTracks());
    }
    return null;
  }, [stream]);

  // Bind audio stream to DOM element and handle browser autoplay policy restrictions
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (el.srcObject !== audioStream) {
      el.srcObject = audioStream;
    }
    if (!audioStream) return;

    let cleanup = null;
    el.play().catch(() => {
      // Autoplay blocked by browser policy: retry on next user gesture
      const retry = () => el.play().catch(() => {});
      document.addEventListener("pointerdown", retry, { once: true });
      cleanup = () => document.removeEventListener("pointerdown", retry);
    });

    return () => cleanup?.();
  }, [audioStream]);

  // Configure speaker output destination using Chromium setSinkId API
  useEffect(() => {
    const el = audioRef.current;
    if (!el || typeof el.setSinkId !== "function") return;

    el.setSinkId(outputDeviceId || "").catch(() => {
      // If configured audio sink fails or disconnects, notify parent to fallback
      if (outputDeviceId) {
        onOutputErrorRef.current?.();
      }
    });
  }, [outputDeviceId]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
