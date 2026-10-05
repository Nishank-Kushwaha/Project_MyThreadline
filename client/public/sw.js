// Service worker for Threadline notifications.
// Phase 1: lifecycle + notification click. The "push" handler comes in Phase 5.

self.addEventListener("install", () => {
  self.skipWaiting(); // activate the new version immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim()); // control already-open tabs
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
