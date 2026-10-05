import {
  getPushPublicKeyRequest,
  subscribePushRequest,
  unsubscribePushRequest,
} from "@/api/pushApi";
import { getNotificationPermission } from "@/lib/notifications";

export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// The server's public key is base64url; the browser wants raw bytes.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

// An existing subscription is only reusable if it was made with the server's
// current key (a changed VAPID key makes old subscriptions useless).
function usesKey(subscription, key) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;

  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((v, i) => v === key[i]);
}

let inFlight = null; // dev StrictMode runs effects twice; share one attempt

// Creates (or reuses) this browser's push subscription and registers it with
// the server. Safe to call repeatedly: the server upserts by endpoint, so
// calling it after every login also moves the subscription to the new user.
// Never throws; push is a bonus and must never break the app.
export function subscribeToPush() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      if (!isPushSupported()) return false;
      if (getNotificationPermission() !== "granted") return false;

      const { data } = await getPushPublicKeyRequest();
      const key = urlBase64ToUint8Array(data.publicKey);

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !usesKey(subscription, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }

      await subscribePushRequest(subscription.toJSON());
      return true;
    } catch (err) {
      console.error("[push] couldn't subscribe:", err.message);
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// Removes the subscription from the server AND the browser. The browser step
// runs even if the server call fails (e.g. expired token): once the browser
// drops it, the push service rejects further pushes and the server deletes
// the stale row the next time it tries. Never throws.
export async function unsubscribeFromPush() {
  try {
    if (!isPushSupported()) return;

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    try {
      await unsubscribePushRequest(subscription.endpoint);
    } catch (err) {
      console.error("[push] server unsubscribe failed:", err.message);
    }

    await subscription.unsubscribe();
  } catch (err) {
    console.error("[push] couldn't unsubscribe:", err.message);
  }
}
