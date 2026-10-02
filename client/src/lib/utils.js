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
