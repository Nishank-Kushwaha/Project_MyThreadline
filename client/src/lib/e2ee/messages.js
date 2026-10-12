import { getIdentity } from "./identity";
import { getUserDeviceKeys } from "./directory";
import { decryptEnvelope, encryptEnvelope } from "./crypto";

export const MAX_TEXT_LENGTH = 4000;
export const ENCRYPTED_PREVIEW = "🔒 Encrypted message";

// Decides how to send: -> { e2ee } for an encrypted message, or { text } for a
// chat that can't be encrypted yet. Throws with a readable message.
export async function buildOutgoingMessage({ room, currentUser, text }) {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be up to ${MAX_TEXT_LENGTH} characters.`);
  }

  // Groups aren't encrypted yet (Phase 4).
  if (room.type !== "private") return { text };

  let [mine, theirs] = await Promise.all([
    getUserDeviceKeys(currentUser.id),
    getUserDeviceKeys(room.otherUserId),
  ]);

  // The cached list may be a few seconds old: re-check before giving up.
  if (mine.length === 0 || theirs.length === 0) {
    [mine, theirs] = await Promise.all([
      getUserDeviceKeys(currentUser.id, { force: true }),
      getUserDeviceKeys(room.otherUserId, { force: true }),
    ]);
  }

  if (mine.length === 0 || theirs.length === 0) {
    if (room.encrypted) {
      throw new Error("Encryption isn't available for this chat right now.");
    }
    return { text }; // the other person hasn't set up encryption yet
  }

  const identity = await getIdentity(currentUser.id);

  const envelope = await encryptEnvelope({
    roomId: room.id,
    payload: { text },
    sender: {
      userId: currentUser.id,
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    },
    recipients: [...mine, ...theirs].map((key) => ({
      userId: key.userId,
      deviceId: key.deviceId,
      publicKey: key.publicKey,
    })),
  });

  return { e2ee: envelope };
}

// Plaintext and system messages come back unchanged. Encrypted ones come back
// with `text` filled in and `decrypt`: "ok" | "failed" | "other-device".
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

    return { ...message, text: payload.text, decrypt: "ok" };
  } catch (err) {
    return {
      ...message,
      text: "",
      decrypt: err.reason === "not-for-this-device" ? "other-device" : "failed",
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
