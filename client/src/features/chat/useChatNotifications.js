import { useEffect, useRef } from "react";
import { resolveAvatarUrl } from "@/lib/utils";
import { showNotification } from "@/lib/notifications";
import { useBrowserNotificationsOn } from "./useBrowserNotifications";

const MAX_BODY_LENGTH = 120;

// True when the person isn't looking at the app: another tab, a minimized
// window, or another window in front.
function isAppInBackground() {
  return document.visibilityState === "hidden" || !document.hasFocus();
}

function trimText(text) {
  return text.length > MAX_BODY_LENGTH
    ? `${text.slice(0, MAX_BODY_LENGTH)}…`
    : text;
}

function notify(options) {
  showNotification(options).catch((err) =>
    console.error("[notifications] couldn't show notification:", err.message),
  );
}

// Shows a browser notification for new messages and for being added to a
// chat/group, but only while the app is in the background.
export function useChatNotifications({ socket, user }) {
  const browserOn = useBrowserNotificationsOn();
  const accountEnabled = user?.notificationSettings?.enabled ?? true;
  const enabled = accountEnabled && browserOn;
  const showPreview = user?.notificationSettings?.showPreview ?? true;

  // Confirms to the server that this page received each message. A frozen or
  // suspended tab can't, and that silence is what makes the server send a push.
  useEffect(() => {
    if (!socket || !user?.id) return;

    const handleReceived = ({ message }) => {
      if (message.sender._id !== user.id) {
        socket.emit("message:handled", { messageId: message._id });
      }
    };

    socket.on("message:new", handleReceived);
    return () => socket.off("message:new", handleReceived);
  }, [socket, user?.id]);

  useEffect(() => {
    if (!socket || !user?.id || !enabled) return;

    const handleNewMessage = ({ roomId, message, room }) => {
      if (message.sender._id === user.id) return;
      if (!isAppInBackground()) return;

      const isGroup = room?.type === "group";

      // The sender's name always shows; the text only when previews are on.
      const text = showPreview ? trimText(message.text) : "New message";

      notify({
        title: isGroup ? room.name : message.sender.name,
        body: isGroup ? `${message.sender.name}: ${text}` : text,
        icon:
          resolveAvatarUrl(
            isGroup ? room.avatarUrl : message.sender.avatarUrl,
          ) || undefined,
        tag: `room:${roomId}`,
        data: { roomId, messageId: message._id },
      });
    };

    // Someone started a chat with me / added me to a group.
    const handleRoomNew = (room) => {
      if (!isAppInBackground()) return;

      notify({
        title: room.name || "Threadline",
        body:
          room.type === "group"
            ? "You were added to this group"
            : "Started a chat with you",
        icon: resolveAvatarUrl(room.avatarUrl) || undefined,
        tag: `room:${room.id}`,
        data: { roomId: room.id },
      });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("room:new", handleRoomNew);
    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("room:new", handleRoomNew);
    };
  }, [socket, user?.id, enabled, showPreview]);
}

// The service worker posts { type: "open-room", roomId } when a notification
// is clicked while the app is open.
export function useNotificationClicks(onOpenRoom) {
  const handlerRef = useRef(onOpenRoom);
  handlerRef.current = onOpenRoom;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event) => {
      if (event.data?.type === "open-room") {
        handlerRef.current(event.data.roomId);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);
}

// "(3) Threadline" in the tab title while there are unread messages.
export function useUnreadTitle(rooms, baseTitle = "Threadline") {
  const total = rooms.reduce((sum, room) => sum + (room.unreadCount || 0), 0);

  useEffect(() => {
    document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
  }, [total, baseTitle]);

  // Put the plain title back when leaving the dashboard.
  useEffect(() => {
    return () => {
      document.title = baseTitle;
    };
  }, [baseTitle]);
}
