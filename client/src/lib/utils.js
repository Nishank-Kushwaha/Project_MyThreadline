import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// VITE_API_URL is like "http://localhost:5000/api" — strip "/api" to get
// the server origin, which is where uploaded avatars are actually served from.
export const SERVER_ORIGIN = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

// avatarUrl from the backend is a relative path ("/uploads/..."); Google
// avatars are already a full https:// URL. Handle both.
export function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  // Full URLs (Cloudinary, Google) and local previews (blob:, data:) are used as-is.
  return /^(https?:|blob:|data:)/.test(avatarUrl)
    ? avatarUrl
    : `${SERVER_ORIGIN}${avatarUrl}`;
}

// "Last seen today at 04:32 PM" / "yesterday" / a date.
export function formatLastSeen(lastSeen) {
  if (!lastSeen) return "Offline";
  const date = new Date(lastSeen);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (date.toDateString() === now.toDateString())
    return `Last seen today at ${time}`;
  if (date.toDateString() === yesterday.toDateString())
    return `Last seen yesterday at ${time}`;
  return `Last seen ${date.toLocaleDateString()}`;
}

// Formats a message date for WhatsApp-style separators:
// "Today", "Yesterday", Day of week (e.g. "Sunday") if within the last 6 days, or "DD/MM/YYYY"
export function formatDateSeparator(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const diffDays = Math.round((todayStart - dateStart) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  // DD/MM/YYYY or standard localized date
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Checks whether a file or object represents a GIF (by MIME type, extension, or flag)
 */
export function isGifFile(file) {
  if (!file) return false;
  if (file.isGif === true || file.gifPlayback === true) return true;

  const type = String(
    file.type || file.mimeType || file.fileType || "",
  ).toLowerCase();
  if (type === "image/gif" || type === "video/gif") return true;

  const name = String(file.name || file.fileName || "").toLowerCase();
  return name.endsWith(".gif") || name.endsWith(".gifv");
}

// Downloads a picked GIF and wraps it as a silent H.264 MP4 File (WhatsApp-style).
// 1. Checks if the picker provider (GIPHY/Tenor) provides a native MP4 stream.
//    If so, fetches the direct MP4 (instant, zero CPU overhead, pristine quality).
// 2. Otherwise downloads the GIF image blob and converts it to MP4 via convertGifToMp4.
// Both paths return a standard `video/mp4` File with `isGif = true`.
export async function gifToFile(gif) {
  const base =
    String(gif?.description || "gif")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "gif";

  // Check for direct native MP4 URL provided by GIPHY or Tenor
  const mp4Url =
    gif?.raw?.images?.downsized_small?.mp4 ||
    gif?.raw?.images?.fixed_height?.mp4 ||
    gif?.raw?.images?.original?.mp4 ||
    gif?.raw?.media_formats?.mp4?.url ||
    gif?.raw?.media_formats?.tiny_mp4?.url;

  if (mp4Url) {
    try {
      const res = await fetch(mp4Url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], `${base}.mp4`, { type: "video/mp4" });
        file.isGif = true;
        file.gifPlayback = true;
        return file;
      }
    } catch (e) {
      console.warn("Direct MP4 fetch failed, falling back to converter:", e);
    }
  }

  // Fallback: download the GIF image and convert it to MP4
  const imageUrl = gif?.imageUrl;
  if (!imageUrl) throw new Error("GIF has no valid image or video source");

  const res = await fetch(imageUrl, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();

  const tempGifFile = new File([blob], `${base}.gif`, { type: "image/gif" });
  const { convertGifToMp4 } = await import("@/features/chat/lib/gifConverter");
  return await convertGifToMp4(tempGifFile);
}

/**
 * Maps WebRTC / getUserMedia DOMExceptions into clear, user-friendly messages.
 */
export function formatMediaDeviceError(error) {
  if (!error)
    return "An unexpected error occurred while accessing media devices.";

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
