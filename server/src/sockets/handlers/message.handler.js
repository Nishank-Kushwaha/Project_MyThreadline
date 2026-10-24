import Message from "../../models/Message.js";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";
import {
  notifyAboutMessage,
  acknowledgeMessage,
} from "../../modules/push/push.notifications.js";
import {
  allMembersHaveDeviceKeys,
  validateEnvelope,
  validateReaction,
  validatePollVote,
  viewForUser,
} from "../../modules/messages/e2ee.validation.js";
import { deleteMediaFile } from "../../modules/media/media.service.js";

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

// Sends one event to every member, building each person's payload separately so
// an encrypted message carries only that person's own locked keys.
function emitToMembers(io, room, event, buildPayload) {
  for (const member of room.members) {
    const memberId = member.userId.toString();
    io.to(`user:${memberId}`).emit(event, buildPayload(memberId));
  }
}

function registerMessageHandlers(io, socket) {
  // Fired when a user sends a message. The server saves it, updates the room's
  // lastMessage, and broadcasts it to everyone in the room (including the sender).
  socket.on(
    "message:send",
    async ({ roomId, text, media, poll, e2ee, replyTo }, callback) => {
      try {
        const room = await Room.findOne({
          _id: roomId,
          "members.userId": socket.userId,
        });
        if (!room) throw new ApiError(403, "You are not a member of this room");

        // 100% E2EE enforcement: All messages, media, replies, and polls must be encrypted.
        if (!e2ee) {
          throw new ApiError(400, "All messages must be end-to-end encrypted.");
        }

        if (media) {
          throw new ApiError(
            400,
            "Unencrypted media is not allowed. Media must be encrypted inside the E2EE envelope.",
          );
        }

        if (replyTo) {
          throw new ApiError(
            400,
            "Unencrypted reply data is not allowed. Reply context must be encrypted inside the E2EE envelope.",
          );
        }

        if (text) {
          throw new ApiError(
            400,
            "Plaintext messages are not allowed. Text must be encrypted inside the E2EE envelope.",
          );
        }

        const envelope = await validateEnvelope(e2ee, {
          room,
          userId: socket.userId,
          deviceId: socket.data.deviceId,
        });
        room.encrypted = true;

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
          encrypted: true,
          text: "",
          ...(poll && {
            poll: {
              options: (poll.options || []).map((o) => ({
                id: o.id,
              })),
              allowMultipleAnswers: Boolean(poll.allowMultipleAnswers),
              votes: [],
            },
          }),
          e2ee: envelope,
          deliveredTo,
        });
        await message.populate("sender", "name avatarUrl");
        await message.populate("poll.votes.userId", "name avatarUrl");

        room.members.forEach((member) => {
          if (member.userId.toString() !== socket.userId)
            member.unreadCount += 1;
        });

        room.lastMessage = {
          messageId: message._id,
          text: "",
          sender: socket.userId,
          createdAt: message.createdAt,
          encrypted: true,
          e2ee: envelope,
        };
        await room.save();

        const roomInfo = {
          type: room.type,
          name: room.name,
          avatarUrl: room.groupAvatarUrl,
        };

        // Each member gets only their own locked keys.
        const plain = message.toJSON();

        emitToMembers(io, room, "message:new", (memberId) => ({
          roomId,
          message: viewForUser(plain, memberId),
          // Lets any page build a notification without already knowing the room.
          room: roomInfo,
        }));

        callback?.({
          success: true,
          message: viewForUser(plain, socket.userId),
        });

        // Per recipient device: push right away if the device is offline, or if
        // it's connected but its page doesn't confirm in time. Not awaited, so a
        // slow push service never delays the message itself.
        notifyAboutMessage(io, { room, message, recipientIds: otherIds });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    },
  );

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

  // This client's page received a message and acted on it. Cancels the
  // fallback push scheduled in message:send.
  socket.on("message:handled", ({ messageId } = {}) => {
    if (messageId) {
      acknowledgeMessage(socket.userId, socket.data.deviceId, messageId);
    }
  });

  // One reaction per user per message.
  // 100% E2EE: Reactions are sealed (iv + ciphertext).
  socket.on(
    "message:react",
    async ({ roomId, messageId, emoji, reaction, remove }, callback) => {
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

        if (message.deletedAt) {
          throw new ApiError(400, "Cannot react to a deleted message");
        }

        if (emoji) {
          throw new ApiError(
            400,
            "Plaintext reactions are not allowed. Reactions must be end-to-end encrypted.",
          );
        }

        if (!remove && !reaction) {
          throw new ApiError(400, "Encrypted reaction payload required");
        }

        const existingIndex = message.reactions.findIndex(
          (r) => r.userId.toString() === socket.userId,
        );

        if (existingIndex !== -1) message.reactions.splice(existingIndex, 1);

        if (!remove) {
          message.reactions.push({
            userId: socket.userId,
            ...validateReaction(reaction),
          });
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
    },
  );

  // Poll voting handler: 100% E2EE sealed vote (iv + ciphertext)
  socket.on(
    "message:poll-vote",
    async ({ roomId, messageId, selectedOptionIds, vote }, callback) => {
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

        if (message.deletedAt) {
          throw new ApiError(400, "Cannot vote on a deleted message");
        }

        if (!message.poll) {
          throw new ApiError(400, "This message is not a poll");
        }

        if (selectedOptionIds) {
          throw new ApiError(
            400,
            "Plaintext poll votes are not allowed. Votes must be end-to-end encrypted.",
          );
        }

        if (!vote) {
          throw new ApiError(400, "Encrypted vote required");
        }

        if (!message.poll.votes) {
          message.poll.votes = [];
        }

        const existingIndex = message.poll.votes.findIndex(
          (v) => v.userId.toString() === socket.userId,
        );

        const validatedVote = validatePollVote(vote);

        if (existingIndex !== -1) {
          message.poll.votes[existingIndex].iv = validatedVote.iv;
          message.poll.votes[existingIndex].ciphertext =
            validatedVote.ciphertext;
          message.poll.votes[existingIndex].updatedAt = new Date();
        } else {
          message.poll.votes.push({
            userId: socket.userId,
            ...validatedVote,
            updatedAt: new Date(),
          });
        }

        await message.save();
        await message.populate("poll.votes.userId", "name avatarUrl");

        io.to(roomId).emit("message:poll-vote-update", {
          roomId,
          messageId,
          votes: message.poll.votes,
        });

        callback?.({ success: true });
      } catch (err) {
        callback?.({
          success: false,
          message: err.message,
        });
      }
    },
  );

  // Sender-only, within the edit window, and never on an already-deleted message.
  // 100% E2EE: Edits must always be encrypted with a new E2EE envelope.
  socket.on(
    "message:edit",
    async ({ roomId, messageId, text, e2ee }, callback) => {
      try {
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

        if (message.poll) {
          throw new ApiError(400, "Polls cannot be edited");
        }

        const age = Date.now() - message.createdAt.getTime();
        if (age > EDIT_WINDOW_MS)
          throw new ApiError(403, "This message is too old to edit");

        if (!e2ee) {
          throw new ApiError(
            400,
            "All message edits must be end-to-end encrypted.",
          );
        }

        if (text) {
          throw new ApiError(400, "Plaintext message edits are not allowed.");
        }

        const envelope = await validateEnvelope(e2ee, {
          room,
          userId: socket.userId,
          deviceId: socket.data.deviceId,
        });

        message.e2ee = envelope; // the old ciphertext is replaced
        message.editedAt = new Date();
        await message.save();

        // If this was the room's preview message, keep the sidebar in sync too.
        if (room.lastMessage?.messageId?.toString() === messageId) {
          room.lastMessage.e2ee = envelope;
          room.markModified("lastMessage.e2ee");
          await room.save();
        }

        const edited = {
          roomId,
          messageId,
          senderId: socket.userId,
          editedAt: message.editedAt,
        };

        emitToMembers(io, room, "message:edited", (memberId) => ({
          ...edited,
          e2ee: viewForUser({ e2ee: envelope }, memberId).e2ee,
        }));

        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    },
  );

  // Soft delete: sender-only, no time limit.
  // Keeps the document in the database to preserve conversation history.
  socket.on(
    "message:delete",
    async ({ roomId, messageId, mediaPublicId }, callback) => {
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

        // Delete from Cloudinary if mediaPublicId provided (client sends decrypted publicId)
        if (mediaPublicId) {
          try {
            await deleteMediaFile(mediaPublicId);
          } catch (err) {
            console.error(
              "[socket] Failed to delete media from Cloudinary:",
              err.message,
            );
          }
        }

        // Soft delete: clear all text, reactions, poll, and E2EE envelope
        const DELETED_PREVIEW_TEXT = "This message was deleted";

        message.text = DELETED_PREVIEW_TEXT;
        message.reactions = [];
        message.poll = undefined;
        message.e2ee = undefined; // ciphertext is removed along with the message
        message.deletedAt = new Date();

        await message.save();

        // Update room's last message preview if necessary
        if (room.lastMessage?.messageId?.toString() === messageId) {
          room.lastMessage.text = DELETED_PREVIEW_TEXT;
          room.lastMessage.e2ee = undefined;
          room.lastMessage.encrypted = false;
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
    },
  );
}

export default registerMessageHandlers;
