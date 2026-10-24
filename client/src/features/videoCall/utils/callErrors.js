/**
 * Maps WebRTC / getUserMedia DOMExceptions into clear, user-friendly messages.
 */
export function formatMediaDeviceError(error) {
  if (!error) return "An unexpected error occurred while accessing media devices.";

  const name = error.name || "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera or microphone permission was denied. Please grant access in your browser settings to continue.";

    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera or microphone was detected on this device.";

    case "NotReadableError":
    case "TrackStartError":
      return "Your camera or microphone is already in use by another application.";

    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Requested camera resolution or audio settings are not supported by your hardware.";

    case "TypeError":
      return "Secure context (HTTPS or localhost) is required for audio and video calls.";

    default:
      return error.message || "Failed to initialize audio/video stream.";
  }
}
