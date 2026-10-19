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
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

