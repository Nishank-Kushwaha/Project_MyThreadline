// Small wrapper around the browser's notification + service worker APIs.

const BROWSER_FLAG_KEY = "threadline:browser-notifications";
const DEVICE_ID_KEY = "threadline:device-id";

export const BROWSER_NOTIFICATIONS_EVENT = "threadline:browser-notifications";

let fallbackDeviceId = null;

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

  // Already on screen for this exact message (for example a push that arrived
  // while this tab was frozen)? Don't show it twice.
  if (tag && data?.messageId) {
    const existing = await registration.getNotifications({ tag });
    if (existing.some((n) => n.data?.messageId === data.messageId)) {
      return false;
    }
  }

  await registration.showNotification(title, {
    body,
    icon,
    tag,
    data,
    renotify: Boolean(tag), // alert again when a tagged notification is replaced
  });

  return true;
}

// On unless this browser was switched off from the dashboard.
export function isBrowserNotificationsOn() {
  try {
    return localStorage.getItem(BROWSER_FLAG_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setBrowserNotificationsOn(isOn) {
  try {
    if (isOn) localStorage.removeItem(BROWSER_FLAG_KEY);
    else localStorage.setItem(BROWSER_FLAG_KEY, "off");
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
  window.dispatchEvent(new Event(BROWSER_NOTIFICATIONS_EVENT));
}

// A random id for THIS browser. Sent with the socket connection and with the
// push subscription, so the server can tell which of your devices is online.
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // storage unavailable: still stable for this page's lifetime
    fallbackDeviceId ??= crypto.randomUUID();
    return fallbackDeviceId;
  }
}

export function isIOS() {
  const iPadOnMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || iPadOnMac;
}

// True when the app was launched from the Home Screen / installed.
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
