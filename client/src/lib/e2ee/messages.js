import { getIdentity } from "./identity";
import { getRoomEncryption } from "./directory";
import {
  decryptEnvelope,
  decryptReaction,
  encryptEnvelope,
  encryptReaction,
  generateMessageSecret,
} from "./crypto";

export const MAX_TEXT_LENGTH = 4000;
export const ENCRYPTED_PREVIEW = "🔒 Encrypted message";

// Decides how to send: -> { e2ee } for an encrypted message, or { text } for a
// chat that can't be encrypted yet. Throws with a readable message.
export async function buildOutgoingMessage({
  room,
  currentUser,
  text,
  secret,
}) {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be up to ${MAX_TEXT_LENGTH} characters.`);
  }

  const hasAllKeys = (info) => info.members.every((m) => m.hasKeys);

  let info = await getRoomEncryption(room.id);

  // The cached list may be a few seconds old: re-check before giving up.
  if (!hasAllKeys(info)) {
    info = await getRoomEncryption(room.id, { force: true });
  }

  const mustEncrypt = info.encrypted || room.encrypted;

  // Not everyone can read encrypted messages yet and the chat isn't locked in.
  if (!hasAllKeys(info) && !mustEncrypt) return { text };

  // A private chat with a device-less person has nobody who could read it.
  if (room.type === "private" && !hasAllKeys(info)) {
    throw new Error("Encryption isn't available for this chat right now.");
  }

  const identity = await getIdentity(currentUser.id);

  const envelope = await encryptEnvelope({
    roomId: room.id,
    payload: { text, secret: secret ?? generateMessageSecret() },
    sender: {
      userId: currentUser.id,
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    },
    recipients: info.devices,
  });

  return { e2ee: envelope };
}

// Plaintext and system messages come back unchanged. Encrypted ones come back
// with `text` filled in, `secret` (used for reactions), their reactions
// decrypted, and `decrypt`: "ok" | "failed" | "other-device" | "not-recipient".
export async function decryptMessage(message, { roomId, userId }) {
  if (!message.encrypted || !message.e2ee) return message;

  try {
    const identity = await getIdentity(userId);

    const payload = await decryptEnvelope({
      roomId,
      envelope: message.e2ee,
      senderUserId: message.sender._id,
      me: identity,
    });

    const secret = payload.secret ?? null;

    return {
      ...message,
      text: payload.text,
      secret,
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
      secret: null,
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
    const identity = await getIdentity(userId);

    const payload = await decryptEnvelope({
      roomId,
      envelope: lastMessage.e2ee,
      senderUserId: lastMessage.sender,
      me: identity,
    });

    return payload.text;
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

// What to send for a reaction: { emoji } on a plain message (the server
// toggles), or for an encrypted one either { remove: true } or
// { reaction: { iv, ciphertext } }.
export async function buildReactionRequest({
  message,
  emoji,
  roomId,
  currentUserId,
}) {
  if (!message.encrypted) return { emoji };

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
