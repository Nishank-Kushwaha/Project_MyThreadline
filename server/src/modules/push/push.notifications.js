import User from "../../models/User.js";
import { sendToUser } from "./push.service.js";

const MAX_BODY_LENGTH = 120;

// The service worker can only load absolute image URLs.
function avatarFor(url) {
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : undefined;
}

function trimText(text = "") {
  return text.length > MAX_BODY_LENGTH
    ? `${text.slice(0, MAX_BODY_LENGTH)}…`
    : text;
}

// Phase 6 adds these fields to the user. Until then everyone defaults to on.
async function getPrefsFor(userIds) {
  const users = await User.find({ _id: { $in: userIds } })
    .select("notificationSettings")
    .lean();

  const prefs = new Map(
    users.map((u) => [
      u._id.toString(),
      {
        enabled: u.notificationSettings?.enabled ?? true,
        showPreview: u.notificationSettings?.showPreview ?? true,
      },
    ]),
  );

  return (userId) => prefs.get(userId) ?? { enabled: true, showPreview: true };
}

async function isUserOnline(io, userId) {
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
}

// A new chat message. `recipientIds` must already be limited to people with no
// live connection (message:send knows this).
async function pushNewMessage({ room, message, recipientIds }) {
  try {
    if (recipientIds.length === 0) return;

    const prefsFor = await getPrefsFor(recipientIds);
    const isGroup = room.type === "group";
    const senderName = message.sender.name;

    await Promise.all(
      recipientIds.map(async (userId) => {
        const { enabled, showPreview } = prefsFor(userId);
        if (!enabled) return;

        // The sender's name always shows; the text only when previews are on.
        const text = showPreview ? trimText(message.text) : "New message";

        await sendToUser(userId, {
          title: isGroup ? room.name : senderName,
          body: isGroup ? `${senderName}: ${text}` : text,
          icon: avatarFor(
            isGroup ? room.groupAvatarUrl : message.sender.avatarUrl,
          ),
          tag: `room:${room._id}`,
          data: { roomId: room._id.toString() },
        });
      }),
    );
  } catch (err) {
    console.error("[push] pushNewMessage failed:", err.message);
  }
}

// Someone was added to a chat/group. `room` is the shaped room for that user
// (the same object sent in the "room:new" socket event).
async function pushRoomAdded(io, { userId, room }) {
  try {
    // createPrivateRoom reuses an existing chat: that isn't "new", so no alert.
    if (room.type === "private" && room.lastMessage) return;

    // An online user already gets "room:new" and the in-page notification.
    if (await isUserOnline(io, userId)) return;

    const { enabled } = (await getPrefsFor([userId]))(userId);
    if (!enabled) return;

    await sendToUser(userId, {
      title: room.name || "Threadline",
      body:
        room.type === "group"
          ? "You were added to this group"
          : "Started a chat with you",
      icon: avatarFor(room.avatarUrl),
      tag: `room:${room.id}`,
      data: { roomId: room.id.toString() },
    });
  } catch (err) {
    console.error("[push] pushRoomAdded failed:", err.message);
  }
}

export { pushNewMessage, pushRoomAdded };
