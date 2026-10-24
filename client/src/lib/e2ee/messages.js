import { getDecryptionIdentity, getIdentity } from "./identity";
import { getRoomEncryption } from "./directory";
import {
  decryptEnvelope,
  decryptReaction,
  decryptPollVote,
  encryptEnvelope,
  encryptReaction,
  encryptPollVote,
  generateMessageSecret,
} from "./crypto";

export const MAX_TEXT_LENGTH = 4000;
export const ENCRYPTED_PREVIEW = "🔒 Encrypted message";

// Decides how to send: -> { e2ee } for an encrypted message, or { text } for a
// chat that can't be encrypted yet. Throws with a readable message.
export async function buildOutgoingMessage({
  room,
  currentUser,
  text = "",
  media = null,
  replyTo = null,
  poll = null,
  secret,
}) {
  if (text && text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be up to ${MAX_TEXT_LENGTH} characters.`);
  }

  const hasAllKeys = (info) => info.members.every((m) => m.hasKeys);

  let info = await getRoomEncryption(room.id);

  // Re-check before giving up
  if (!hasAllKeys(info)) {
    info = await getRoomEncryption(room.id, { force: true });
  }

  // 100% E2EE enforcement: all members must have registered encryption keys
  if (!hasAllKeys(info)) {
    throw new Error(
      room.type === "private"
        ? "The other person hasn't registered a device key for end-to-end encryption yet."
        : "Some group members haven't registered device keys for end-to-end encryption yet.",
    );
  }

  const identity = await getIdentity(currentUser.id);

  const envelope = await encryptEnvelope({
    roomId: room.id,
    payload: {
      text: text || "",
      ...(media && { media }),
      ...(replyTo && { replyTo }),
      ...(poll && { poll }),
      secret: secret ?? generateMessageSecret(),
    },
    sender: {
      userId: currentUser.id,
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    },
    recipients: info.devices,
  });

  return {
    e2ee: envelope,
    ...(poll && {
      poll: {
        options: poll.options.map((o) => ({ id: o.id })),
        allowMultipleAnswers: Boolean(poll.allowMultipleAnswers),
      },
    }),
  };
}

// Plaintext and system messages come back unchanged. Encrypted ones come back
// with `text` filled in, `media` (if attached), `secret` (used for reactions & votes), their reactions
// & poll votes decrypted, and `decrypt`: "ok" | "failed" | "other-device" | "not-recipient".
export async function decryptMessage(message, { roomId, userId }) {
  if (!message.encrypted || !message.e2ee) return message;

  try {
    const identity = await getDecryptionIdentity(userId);

    const payload = await decryptEnvelope({
      roomId,
      envelope: message.e2ee,
      senderUserId: message.sender._id,
      me: identity,
    });

    const secret = payload.secret ?? null;

    let poll = null;
    if (payload.poll) {
      const decryptedVotes = await decryptPollVotes(message.poll?.votes || [], {
        secret,
        roomId,
        messageId: message._id,
      });
      poll = {
        ...payload.poll,
        votes: decryptedVotes,
      };
    } else if (message.poll) {
      poll = message.poll;
    }

    return {
      ...message,
      text: payload.text || "",
      media: payload.media || null,
      replyTo: payload.replyTo || message.replyTo || null,
      secret,
      poll,
      reactions: await decryptReactions(message.reactions, {
        secret,
        roomId,
        messageId: message._id,
      }),
      decrypt: "ok",
    };
  } catch (err) {
    const reasons = {
      "not-for-this-device": "other-device",
      "not-a-recipient": "not-recipient",
    };

    return {
      ...message,
      text: "",
      media: null,
      secret: null,
      poll: null,
      // Sealed reactions can't be opened without the message; plain ones can.
      reactions: (message.reactions ?? []).filter((r) => !r.ciphertext),
      decrypt: reasons[err.reason] ?? "failed",
    };
  }
}

export const decryptMessages = (messages, context) =>
  Promise.all(messages.map((message) => decryptMessage(message, context)));

// The sidebar preview of an encrypted last message. Always returns a string.
export async function decryptPreview(lastMessage, { roomId, userId }) {
  try {
    const identity = await getDecryptionIdentity(userId);

    const payload = await decryptEnvelope({
      roomId,
      envelope: lastMessage.e2ee,
      senderUserId: lastMessage.sender,
      me: identity,
    });

    if (payload.poll) return `📊 Poll: ${payload.poll.question || "Poll"}`;
    if (payload.text) return payload.text;
    if (payload.media) {
      if (payload.media.fileType?.startsWith("image/")) return "📷 Photo";
      return `📎 ${payload.media.fileName || "Attachment"}`;
    }
    return ENCRYPTED_PREVIEW;
  } catch (err) {
    console.error("[e2ee] couldn't decrypt a sidebar preview:", err);
    return ENCRYPTED_PREVIEW;
  }
}

// Stored reactions -> the { userId, emoji } shape the UI draws. Plain ones pass
// through; sealed ones are opened with the message secret and dropped if that
// fails (wrong secret, or tampered with).
export async function decryptReactions(
  reactions = [],
  { secret, roomId, messageId },
) {
  const opened = await Promise.all(
    reactions.map(async (reaction) => {
      if (!reaction.ciphertext) return reaction;
      if (!secret) return null;

      try {
        const reactorId = String(reaction.userId?._id ?? reaction.userId);

        const emoji = await decryptReaction({
          secret,
          roomId,
          messageId,
          reactorId,
          reaction,
        });

        return { userId: reaction.userId, emoji };
      } catch {
        return null;
      }
    }),
  );

  return opened.filter(Boolean);
}

// 100% E2EE: Reactions are always encrypted with the message secret
export async function buildReactionRequest({
  message,
  emoji,
  roomId,
  currentUserId,
}) {
  if (!message.secret) {
    throw new Error("Reactions aren't available on this message.");
  }

  const mine = (message.reactions ?? []).find(
    (r) => String(r.userId?._id ?? r.userId) === currentUserId,
  );

  if (mine?.emoji === emoji) return { remove: true }; // same emoji again

  return {
    reaction: await encryptReaction({
      secret: message.secret,
      roomId,
      messageId: message._id,
      reactorId: currentUserId,
      emoji,
    }),
  };
}

// Decrypt poll votes using the message secret
export async function decryptPollVotes(
  votes = [],
  { secret, roomId, messageId },
) {
  const opened = await Promise.all(
    votes.map(async (v) => {
      if (!v.ciphertext) return v;
      if (!secret) return null;

      try {
        const voterId = String(v.userId?._id ?? v.userId);

        const selectedOptionIds = await decryptPollVote({
          secret,
          roomId,
          messageId,
          voterId,
          vote: v,
        });

        return {
          userId: v.userId,
          selectedOptionIds,
          updatedAt: v.updatedAt,
        };
      } catch {
        return null;
      }
    }),
  );

  return opened.filter(Boolean);
}

// 100% E2EE: Poll votes are always encrypted with the poll's message secret
export async function buildPollVoteRequest({
  message,
  selectedOptionIds = [],
  roomId,
  currentUserId,
}) {
  if (!message.secret) {
    throw new Error("Voting is not available on this poll.");
  }

  const vote = await encryptPollVote({
    secret: message.secret,
    roomId,
    messageId: message._id,
    voterId: currentUserId,
    selectedOptionIds,
  });

  return { vote };
}
