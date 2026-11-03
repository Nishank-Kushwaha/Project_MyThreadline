import React, { useEffect, useMemo, useRef } from "react";

/**
 * The ONLY element that plays remote audio. It is mounted once for the whole
 * call (from CallProvider), so minimizing/maximizing the call UI never
 * interrupts the sound or creates a second playback path (a source of echo).
 */
export function RemoteAudio({ stream, outputDeviceId, onOutputError }) {
  const ref = useRef(null);

  // Audio-only view of the stream
  const audioStream = useMemo(
    () =>
      stream && stream.getAudioTracks().length
        ? new MediaStream(stream.getAudioTracks())
        : null,
    [stream],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (el.srcObject !== audioStream) el.srcObject = audioStream;
    if (!audioStream) return;

    let cleanup = null;
    el.play().catch(() => {
      // Autoplay blocked: retry on the next user gesture
      const retry = () => el.play().catch(() => {});
      document.addEventListener("pointerdown", retry, { once: true });
      cleanup = () => document.removeEventListener("pointerdown", retry);
    });
    return () => cleanup?.();
  }, [audioStream]);

  // Speaker selection (Chromium). "" means the system default, so switching BACK to default works too.
  const onOutputErrorRef = useRef(onOutputError);
  onOutputErrorRef.current = onOutputError;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.setSinkId !== "function") return;
    el.setSinkId(outputDeviceId || "").catch(() => {
      // The chosen speaker is gone or not allowed: let the app fall back to the default
      if (outputDeviceId) onOutputErrorRef.current?.();
    });
  }, [outputDeviceId]);

  return <audio ref={ref} autoPlay playsInline />;
}
