import Message from "../../models/Message.js";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";

// Matches WhatsApp's own edit window — long enough to fix a typo, short
// enough that an edit can't quietly rewrite history long after the fact.
const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Which of these users have at least one live socket right now?
async function getOnlineUserIds(io, userIds) {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const sockets = await io.in(`user:${id}`).fetchSockets();
      return sockets.length > 0 ? id : null;
    }),
  );
  return results.filter(Boolean);
}

function registerMessageHandlers(io, socket) {
  // Fired when a user sends a message. The server saves it, updates the room's
  // lastMessage, and broadcasts it to everyone in the room (including the sender).
  socket.on("message:send", async ({ roomId, text }, callback) => {
    try {
      if (!text || !text.trim())
        throw new ApiError(400, "Message text is required");

      const room = await Room.findOne({
        _id: roomId,
        "members.userId": socket.userId,
      });
      if (!room) throw new ApiError(403, "You are not a member of this room");

      // Recipients who are online right now have received it the instant it's
      // broadcast => "delivered". Offline ones are marked later, when they
      // reconnect (see presence.handler.js).
      const otherIds = room.members
        .map((m) => m.userId.toString())
        .filter((id) => id !== socket.userId);
      const deliveredTo = await getOnlineUserIds(io, otherIds);

      const message = await Message.create({
        roomId,
        sender: socket.userId,
        text: text.trim(),
        deliveredTo,
      });
      await message.populate("sender", "name avatarUrl");

      room.members.forEach((member) => {
        if (member.userId.toString() !== socket.userId) member.unreadCount += 1;
      });
      room.lastMessage = {
        messageId: message._id,
        text: message.text,
        sender: socket.userId,
        createdAt: message.createdAt,
      };
      await room.save();

      io.to(roomId).emit("message:new", { roomId, message });
      callback?.({ success: true, message });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // Fired when a user opens/is viewing a room: clears the unread badge AND
  // marks the messages as seen, which turns the sender's ticks blue.
  socket.on("message:seen", async ({ roomId }) => {
    try {
      const room = await Room.findOne({
        _id: roomId,
        "members.userId": socket.userId,
      });
      if (!room) return;

      // 1) Unread badge
      const member = room.members.find(
        (m) => m.userId.toString() === socket.userId,
      );
      if (member && member.unreadCount !== 0) {
        member.unreadCount = 0;
        await room.save();
      }

      // 2) Receipts. Cutoff captured BEFORE the update (same reason as delivery).
      const upTo = new Date().toISOString();
      const result = await Message.updateMany(
        {
          roomId,
          type: { $ne: "system" },
          sender: { $ne: socket.userId },
          seenBy: { $ne: socket.userId },
        },
        { $addToSet: { seenBy: socket.userId, deliveredTo: socket.userId } }, // seen implies delivered
      );

      // Only tell the room if something actually changed, otherwise every
      // repeated "seen" would spam everyone.
      if (result.modifiedCount > 0) {
        socket
          .to(roomId)
          .emit("message:seen-update", { roomId, userId: socket.userId, upTo });
      }
    } catch (err) {
      console.error("[socket] message:seen failed:", err.message);
    }
  });

  // One reaction per user per message: same emoji tapped again -> remove
  // (toggle off); a different emoji -> replace; no prior reaction -> add.
  socket.on("message:react", async ({ roomId, messageId, emoji }, callback) => {
    try {
      if (!emoji) throw new ApiError(400, "emoji is required");

      const room = await Room.findOne({
        _id: roomId,
        "members.userId": socket.userId,
      });

      if (!room) {
        throw new ApiError(403, "You are not a member of this room");
      }

      const message = await Message.findOne({
        _id: messageId,
        roomId,
        type: { $ne: "system" },
      });

      if (!message) {
        throw new ApiError(404, "Message not found");
      }

      if (message.deletedAt) {
        throw new ApiError(400, "Cannot react to a deleted message");
      }

      const existingIndex = message.reactions.findIndex(
        (r) => r.userId.toString() === socket.userId,
      );

      if (
        existingIndex !== -1 &&
        message.reactions[existingIndex].emoji === emoji
      ) {
        message.reactions.splice(existingIndex, 1); // toggle off
      } else if (existingIndex !== -1) {
        message.reactions[existingIndex].emoji = emoji; // replace
      } else {
        message.reactions.push({
          userId: socket.userId,
          emoji,
        }); // add
      }

      await message.save();

      await message.populate("reactions.userId", "name");

      // Send updated reactions to everyone in the room
      io.to(roomId).emit("message:reaction-update", {
        roomId,
        messageId,
        reactions: message.reactions,
      });

      callback?.({ success: true });
    } catch (err) {
      callback?.({
        success: false,
        message: err.message,
      });
    }
  });

  // Sender-only, within the edit window, and never on an already-deleted message.
  socket.on("message:edit", async ({ roomId, messageId, text }, callback) => {
    try {
      if (!text || !text.trim())
        throw new ApiError(400, "Message text is required");

      const room = await Room.findOne({
        _id: roomId,
        "members.userId": socket.userId,
      });
      if (!room) throw new ApiError(403, "You are not a member of this room");

      const message = await Message.findOne({
        _id: messageId,
        roomId,
        type: { $ne: "system" },
      });

      if (!message) throw new ApiError(404, "Message not found");
      if (message.sender.toString() !== socket.userId) {
        throw new ApiError(403, "You can only edit your own messages");
      }
      if (message.deletedAt)
        throw new ApiError(400, "Can't edit a deleted message");

      const age = Date.now() - message.createdAt.getTime();
      if (age > EDIT_WINDOW_MS)
        throw new ApiError(403, "This message is too old to edit");

      message.text = text.trim();
      message.editedAt = new Date();
      await message.save();

      // If this was the room's preview message, keep the sidebar in sync too.
      if (room.lastMessage?.messageId?.toString() === messageId) {
        room.lastMessage.text = message.text;
        await room.save();
      }

      io.to(roomId).emit("message:edited", {
        roomId,
        messageId,
        text: message.text,
        editedAt: message.editedAt,
      });
      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // Soft delete: sender-only, no time limit.
  // Keeps the document in the database to preserve conversation history.
  socket.on("message:delete", async ({ roomId, messageId }, callback) => {
    try {
      const room = await Room.findOne({
        _id: roomId,
        "members.userId": socket.userId,
      });

      if (!room) {
        throw new ApiError(403, "You are not a member of this room");
      }

      const message = await Message.findOne({
        _id: messageId,
        roomId,
        type: { $ne: "system" },
      });

      if (!message) {
        throw new ApiError(404, "Message not found");
      }

      if (message.sender.toString() !== socket.userId) {
        throw new ApiError(403, "You can only delete your own messages");
      }

      if (message.deletedAt) {
        throw new ApiError(400, "Message already deleted");
      }

      // Soft delete
      const DELETED_PREVIEW_TEXT = "This message was deleted";

      message.text = DELETED_PREVIEW_TEXT;
      message.reactions = [];
      message.deletedAt = new Date();

      await message.save();

      // Update room's last message preview if necessary
      if (room.lastMessage?.messageId?.toString() === messageId) {
        room.lastMessage.text = DELETED_PREVIEW_TEXT;
        await room.save();
      }

      // Notify all users in the room
      io.to(roomId).emit("message:deleted", {
        roomId,
        messageId,
        deletedAt: message.deletedAt,
      });

      callback?.({ success: true });
    } catch (err) {
      callback?.({
        success: false,
        message: err.message,
      });
    }
  });
}

export default registerMessageHandlers;
