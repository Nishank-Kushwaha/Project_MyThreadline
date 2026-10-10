// Service worker for Threadline notifications.
// Phase 1: lifecycle + notification click. The "push" handler comes in Phase 5.

self.addEventListener("install", () => {
  self.skipWaiting(); // activate the new version immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim()); // control already-open tabs
});

// A push arrived from the server. If the person is looking at the app right
// now there is nothing to announce. Chrome allows skipping the notification
// ONLY in this case (a visible AND focused window); in any other case it must
// be shown, or Chrome displays a generic "site updated in the background".
self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const isLookingAtApp = windows.some(
        (w) => w.visibilityState === "visible" && w.focused,
      );

      // Chrome lets us skip the notification while the app is on screen. Safari
      // (including iPhone) does not allow silent pushes, so always show there.
      const ua = self.navigator.userAgent;
      const isSafari =
        /iPhone|iPad|iPod/.test(ua) ||
        (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua));

      if (isLookingAtApp && !isSafari) return;

      const existing = await self.registration.getNotifications({
        tag: payload.tag,
      });
      const alreadyShown = existing.some(
        (n) =>
          n.data?.messageId && n.data.messageId === payload.data?.messageId,
      );

      await self.registration.showNotification(payload.title || "Threadline", {
        body: payload.body,
        icon: payload.icon,
        tag: payload.tag,
        data: payload.data,
        renotify: Boolean(payload.tag) && !alreadyShown,
      });
    })(),
  );
});

// Clicking a notification: focus the app (or open it) and tell it which room
// to show. `data.roomId` is set by whoever created the notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const roomId = event.notification.data?.roomId ?? null;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const appWindow = windows[0];

      if (appWindow) {
        await appWindow.focus();
        if (roomId) appWindow.postMessage({ type: "open-room", roomId });
        return;
      }

      // No app tab at all (browser was closed): open one on that room.
      await self.clients.openWindow(roomId ? `/?room=${roomId}` : "/");
    })(),
  );
});
