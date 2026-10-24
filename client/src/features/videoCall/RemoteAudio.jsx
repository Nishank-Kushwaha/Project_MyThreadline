import React, { useEffect, useMemo, useRef } from "react";

/**
 * The ONLY element that plays remote audio. It is mounted once for the whole
 * call (from CallProvider), so minimizing/maximizing the call UI never
 * interrupts the sound or creates a second playback path (a source of echo).
 */
export function RemoteAudio({ stream, outputDeviceId }) {
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

  // Optional speaker selection (Chromium)
  useEffect(() => {
    const el = ref.current;
    if (el && outputDeviceId && typeof el.setSinkId === "function") {
      el.setSinkId(outputDeviceId).catch(() => {});
    }
  }, [outputDeviceId]);

  return <audio ref={ref} autoPlay playsInline />;
}
