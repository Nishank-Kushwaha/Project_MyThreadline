import { base64UrlToBytes, bytesToBase64Url } from "./encoding.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const VERSION = 1;
const CURVE = { name: "ECDH", namedCurve: "P-256" };

const REACTION_BLOCK = 64;
const POLL_VOTE_BLOCK = 128;

export class DecryptError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((total, p) => total + p.length, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

const importPublicKey = (publicKey) =>
  crypto.subtle.importKey("raw", base64UrlToBytes(publicKey), CURVE, false, []);

async function ecdh(privateKey, publicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: await importPublicKey(publicKey) },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}

// Two Diffie-Hellman results are mixed: ephemeral x recipient (fresh per
// message) and sender-static x recipient. Only the real sender's device can
// compute the second one, which is what authenticates the sender.
async function deriveWrapKey(dh1, dh2, info) {
  const material = await crypto.subtle.importKey(
    "raw",
    concat(dh1, dh2),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Context that is cryptographically bound to the message: moving a message to
// another chat, sender or device makes decryption fail.
const bodyAad = (roomId, senderUserId, senderDeviceId) =>
  encoder.encode(
    `threadline-e2ee/v1/body|${roomId}|${senderUserId}|${senderDeviceId}`,
  );

const wrapInfo = ({
  roomId,
  senderUserId,
  senderDeviceId,
  spk,
  recipientUserId,
  recipientDeviceId,
  epk,
}) =>
  encoder.encode(
    `threadline-e2ee/v1/wrap|${roomId}|${senderUserId}|${senderDeviceId}|${spk}|${recipientUserId}|${recipientDeviceId}|${epk}`,
  );

// sender:     { userId, deviceId, publicKey, privateKey }
// recipients: [{ userId, deviceId, publicKey }]  (include the sender's devices)
export async function encryptEnvelope({ roomId, payload, sender, recipients }) {
  const messageKeyBytes = randomBytes(32);

  try {
    const messageKey = await crypto.subtle.importKey(
      "raw",
      messageKeyBytes,
      "AES-GCM",
      false,
      ["encrypt"],
    );

    const iv = randomBytes(12);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: bodyAad(roomId, sender.userId, sender.deviceId),
      },
      messageKey,
      encoder.encode(JSON.stringify(payload)),
    );

    const unique = new Map(
      recipients.map((r) => [`${r.userId}:${r.deviceId}`, r]),
    );

    const keys = await Promise.all(
      [...unique.values()].map(async (recipient) => {
        const ephemeral = await crypto.subtle.generateKey(CURVE, false, [
          "deriveBits",
        ]);

        const epk = bytesToBase64Url(
          new Uint8Array(
            await crypto.subtle.exportKey("raw", ephemeral.publicKey),
          ),
        );

        const dh1 = await ecdh(ephemeral.privateKey, recipient.publicKey);
        const dh2 = await ecdh(sender.privateKey, recipient.publicKey);

        const info = wrapInfo({
          roomId,
          senderUserId: sender.userId,
          senderDeviceId: sender.deviceId,
          spk: sender.publicKey,
          recipientUserId: recipient.userId,
          recipientDeviceId: recipient.deviceId,
          epk,
        });

        const wrapKey = await deriveWrapKey(dh1, dh2, info);
        const wrapIv = randomBytes(12);

        const wrapped = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: wrapIv, additionalData: info },
          wrapKey,
          messageKeyBytes,
        );

        return {
          userId: recipient.userId,
          deviceId: recipient.deviceId,
          epk,
          iv: bytesToBase64Url(wrapIv),
          wrapped: bytesToBase64Url(new Uint8Array(wrapped)),
        };
      }),
    );

    return {
      v: VERSION,
      senderDeviceId: sender.deviceId,
      spk: sender.publicKey,
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
      keys,
    };
  } finally {
    messageKeyBytes.fill(0); // best effort: don't leave the raw key around
  }
}

async function openEnvelope({
  roomId,
  envelope,
  senderUserId,
  userId,
  deviceId,
  privateKey,
  entry,
}) {
  const dh1 = await ecdh(privateKey, entry.epk);
  const dh2 = await ecdh(privateKey, envelope.spk);

  const info = wrapInfo({
    roomId,
    senderUserId,
    senderDeviceId: envelope.senderDeviceId,
    spk: envelope.spk,
    recipientUserId: userId,
    recipientDeviceId: deviceId,
    epk: entry.epk,
  });

  const wrapKey = await deriveWrapKey(dh1, dh2, info);

  const messageKeyBytes = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(entry.iv),
        additionalData: info,
      },
      wrapKey,
      base64UrlToBytes(entry.wrapped),
    ),
  );

  try {
    const messageKey = await crypto.subtle.importKey(
      "raw",
      messageKeyBytes,
      "AES-GCM",
      false,
      ["decrypt"],
    );

    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(envelope.iv),
        additionalData: bodyAad(roomId, senderUserId, envelope.senderDeviceId),
      },
      messageKey,
      base64UrlToBytes(envelope.ciphertext),
    );

    return JSON.parse(decoder.decode(plaintext));
  } finally {
    messageKeyBytes.fill(0);
  }
}

// me: { userId, keys: [{ deviceId, privateKey }] }  (the current key first, then
// keys restored from the backup). The older { userId, deviceId, privateKey }
// shape still works.

export async function decryptEnvelope({ roomId, envelope, senderUserId, me }) {
  if (envelope?.v !== VERSION) throw new DecryptError("unsupported-version");

  const candidates = me.keys ?? [
    { deviceId: me.deviceId, privateKey: me.privateKey },
  ];

  const mine = envelope.keys.filter((key) => key.userId === me.userId);

  // No locks for me at all: I wasn't a member (or had no device) when this was
  // sent.
  if (mine.length === 0) throw new DecryptError("not-a-recipient");

  // Locks for my devices exist, but none of the keys I have fit them.
  const usable = candidates.filter((candidate) =>
    mine.some((key) => key.deviceId === candidate.deviceId),
  );
  if (usable.length === 0) throw new DecryptError("not-for-this-device");

  let lastError;

  for (const candidate of usable) {
    const entry = mine.find((key) => key.deviceId === candidate.deviceId);

    try {
      return await openEnvelope({
        roomId,
        envelope,
        senderUserId,
        userId: me.userId,
        deviceId: candidate.deviceId,
        privateKey: candidate.privateKey,
        entry,
      });
    } catch (err) {
      lastError = err; // wrong key for this lock: try the next one
    }
  }

  throw lastError;
}

// ---------- Reactions ----------
// Every message carries a random 32-byte "secret" inside its encrypted body.
// Everyone who can read the message can derive the reaction key from it, and
// nobody else can.

export function generateMessageSecret() {
  return bytesToBase64Url(randomBytes(32));
}

async function deriveReactionKey(secret, roomId, messageId) {
  const material = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(
        `threadline-e2ee/v1/reaction-key|${roomId}|${messageId}`,
      ),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Binds a reaction to its chat, its message AND the person who made it, so it
// can't be moved to another message or attributed to someone else.
const reactionAad = (roomId, messageId, reactorId) =>
  encoder.encode(
    `threadline-e2ee/v1/reaction|${roomId}|${messageId}|${reactorId}`,
  );

export async function encryptReaction({
  secret,
  roomId,
  messageId,
  reactorId,
  emoji,
}) {
  const bytes = encoder.encode(emoji);

  if (bytes.length === 0 || bytes.length > REACTION_BLOCK - 1) {
    throw new Error("That reaction is too long.");
  }

  // Padded to a fixed size so the ciphertext length doesn't give the emoji away.
  const block = new Uint8Array(REACTION_BLOCK);
  block[0] = bytes.length;
  block.set(bytes, 1);

  const key = await deriveReactionKey(secret, roomId, messageId);
  const iv = randomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: reactionAad(roomId, messageId, reactorId),
    },
    key,
    block,
  );

  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptReaction({
  secret,
  roomId,
  messageId,
  reactorId,
  reaction,
}) {
  const key = await deriveReactionKey(secret, roomId, messageId);

  const block = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(reaction.iv),
        additionalData: reactionAad(roomId, messageId, reactorId),
      },
      key,
      base64UrlToBytes(reaction.ciphertext),
    ),
  );

  const length = block[0];
  if (length === 0 || length > REACTION_BLOCK - 1) {
    throw new Error("Invalid reaction");
  }

  return decoder.decode(block.slice(1, 1 + length));
}

// ---------- Poll Votes ----------
async function derivePollVoteKey(secret, roomId, messageId) {
  const material = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(
        `threadline-e2ee/v1/poll-vote-key|${roomId}|${messageId}`,
      ),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const pollVoteAad = (roomId, messageId, voterId) =>
  encoder.encode(
    `threadline-e2ee/v1/poll-vote|${roomId}|${messageId}|${voterId}`,
  );

export async function encryptPollVote({
  secret,
  roomId,
  messageId,
  voterId,
  selectedOptionIds = [],
}) {
  const jsonStr = JSON.stringify(selectedOptionIds);
  const bytes = encoder.encode(jsonStr);

  if (bytes.length === 0 || bytes.length > POLL_VOTE_BLOCK - 1) {
    throw new Error("Too many options selected.");
  }

  // Padded to a fixed size so the ciphertext length doesn't leak the choices
  const block = new Uint8Array(POLL_VOTE_BLOCK);
  block[0] = bytes.length;
  block.set(bytes, 1);

  const key = await derivePollVoteKey(secret, roomId, messageId);
  const iv = randomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: pollVoteAad(roomId, messageId, voterId),
    },
    key,
    block,
  );

  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptPollVote({
  secret,
  roomId,
  messageId,
  voterId,
  vote,
}) {
  const key = await derivePollVoteKey(secret, roomId, messageId);

  const block = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(vote.iv),
        additionalData: pollVoteAad(roomId, messageId, voterId),
      },
      key,
      base64UrlToBytes(vote.ciphertext),
    ),
  );

  const length = block[0];
  if (length === 0 || length > POLL_VOTE_BLOCK - 1) {
    throw new Error("Invalid poll vote");
  }

  const jsonStr = decoder.decode(block.slice(1, 1 + length));
  return JSON.parse(jsonStr);
}
