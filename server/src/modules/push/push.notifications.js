import User from "../../models/User.js";
import { sendToUser, getSubscribedDeviceIds } from "./push.service.js";

// Longer text is truncated with an ellipsis.
const MAX_BODY_LENGTH = 120;

// How long the server waits for a device to confirm a message before assuming
// its tab is frozen or suspended and sending a push to that device instead.
const ACK_TIMEOUT_MS = 5000;

// "userId:deviceId:messageId" -> timer. In memory, which is fine for one
// server instance.
const pendingAcks = new Map();

// Confirmations that arrived before their timer existed (the server does a
// couple of async lookups before scheduling, and a fast page can reply in that
// gap). Remembered briefly so scheduleFallbackPush can honour them.
const earlyAcks = new Map(); // key -> expiry timer

const ackKey = (userId, deviceId, messageId) =>
  `${userId}:${deviceId ?? "none"}:${messageId}`;

// The service worker can only load absolute image URLs.
function avatarFor(url) {
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : undefined;
}

function trimText(text = "") {
  return text.length > MAX_BODY_LENGTH
    ? `${text.slice(0, MAX_BODY_LENGTH)}…`
    : text;
}

// Missing settings default to on.
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

// For a device that IS connected: push to it anyway unless its page confirms
// it received the message in time (see acknowledgeMessage).
function scheduleFallbackPush({ userId, deviceId, room, message }) {
  const key = ackKey(userId, deviceId, message._id);

  // The page already confirmed while we were still deciding: nothing to wait for.
  if (earlyAcks.has(key)) {
    clearTimeout(earlyAcks.get(key));
    earlyAcks.delete(key);
    return;
  }

  const timer = setTimeout(() => {
    pendingAcks.delete(key);
    pushNewMessage({
      room,
      message,
      recipientIds: [userId],
      deviceIds: [deviceId],
    });
  }, ACK_TIMEOUT_MS);

  pendingAcks.set(key, timer);
}

// Only the owner can add or update their own subscription.
function acknowledgeMessage(userId, deviceId, messageId) {
  const key = ackKey(userId, deviceId, messageId);
  const timer = pendingAcks.get(key);

  if (timer) {
    clearTimeout(timer);
    pendingAcks.delete(key);
    return;
  }

  // No timer yet: remember the confirmation briefly.
  if (!earlyAcks.has(key)) {
    earlyAcks.set(
      key,
      setTimeout(() => earlyAcks.delete(key), ACK_TIMEOUT_MS * 2),
    );
  }
}

// Sends a chat message push. `deviceIds` limits it to those browsers; leave it
// out to reach every device the user has subscribed.
async function pushNewMessage({ room, message, recipientIds, deviceIds }) {
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

        await sendToUser(
          userId,
          {
            title: isGroup ? room.name : senderName,
            body: isGroup ? `${senderName}: ${text}` : text,
            icon: avatarFor(
              isGroup ? room.groupAvatarUrl : message.sender.avatarUrl,
            ),
            tag: `room:${room._id}`,
            data: {
              roomId: room._id.toString(),
              messageId: message._id.toString(),
            },
          },
          { deviceIds },
        );
      }),
    );
  } catch (err) {
    console.error("[push] pushNewMessage failed:", err.message);
  }
}

// Decides, per recipient DEVICE, how a new message reaches them:
//  - device has no live connection  -> push right away
//  - device is connected            -> wait for its page to confirm; push
//                                      only if that doesn't happen in time
// Never throws, so callers can fire it without await.
async function notifyAboutMessage(io, { room, message, recipientIds }) {
  try {
    await Promise.all(
      recipientIds.map(async (userId) => {
        const [sockets, subscribedDevices] = await Promise.all([
          io.in(`user:${userId}`).fetchSockets(),
          getSubscribedDeviceIds(userId),
        ]);

        const connected = new Set(
          sockets.map((s) => s.data.deviceId).filter(Boolean),
        );

        const offlineDevices = [];

        for (const deviceId of new Set(subscribedDevices)) {
          if (deviceId && connected.has(deviceId)) {
            scheduleFallbackPush({ userId, deviceId, room, message });
          } else {
            offlineDevices.push(deviceId);
          }
        }

        if (offlineDevices.length > 0) {
          await pushNewMessage({
            room,
            message,
            recipientIds: [userId],
            deviceIds: offlineDevices,
          });
        }
      }),
    );
  } catch (err) {
    console.error("[push] notifyAboutMessage failed:", err.message);
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

export { notifyAboutMessage, pushRoomAdded, acknowledgeMessage };
