// Small wrapper around the browser's notification + service worker APIs.

export function isNotificationSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

// "default" (not asked yet) | "granted" | "denied" | "unsupported"
export function getNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("[sw] registration failed:", err.message);
    return null;
  }
}

// Must be called from a user gesture (a button click), or browsers ignore it.
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.requestPermission();
}

// Shown through the service worker so it works the same whether the tab is
// open or (later, with push) closed. `tag` makes a newer notification for the
// same room replace the older one instead of stacking.
export async function showNotification({ title, body, icon, tag, data }) {
  if (getNotificationPermission() !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(title, {
    body,
    icon,
    tag,
    data,
    renotify: Boolean(tag), // alert again when a tagged notification is replaced
  });

  return true;
}
