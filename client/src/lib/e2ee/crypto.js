import { base64UrlToBytes, bytesToBase64Url } from "./encoding";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const VERSION = 1;
const CURVE = { name: "ECDH", namedCurve: "P-256" };

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

// me: { userId, deviceId, privateKey }
export async function decryptEnvelope({ roomId, envelope, senderUserId, me }) {
  if (envelope?.v !== VERSION) throw new DecryptError("unsupported-version");

  const entry = envelope.keys.find(
    (key) => key.userId === me.userId && key.deviceId === me.deviceId,
  );
  if (!entry) throw new DecryptError("not-for-this-device");

  const dh1 = await ecdh(me.privateKey, entry.epk);
  const dh2 = await ecdh(me.privateKey, envelope.spk);

  const info = wrapInfo({
    roomId,
    senderUserId,
    senderDeviceId: envelope.senderDeviceId,
    spk: envelope.spk,
    recipientUserId: me.userId,
    recipientDeviceId: me.deviceId,
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
