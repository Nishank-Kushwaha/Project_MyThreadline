import { getDeviceId } from "@/lib/notifications";
import {
  listMyDeviceKeysRequest,
  publishDeviceKeyRequest,
} from "@/api/keysApi";
import { base64UrlToBytes, bytesToBase64Url } from "./encoding";
import { getDeviceKeyRecord, saveDeviceKeyRecord } from "./keyStore";

export function isE2EESupported() {
  return (
    typeof crypto !== "undefined" &&
    Boolean(crypto.subtle) &&
    typeof indexedDB !== "undefined"
  );
}

async function generateDeviceKey(userId, deviceId) {
  // TEMPORARY (until Phase 6): the private key is created extractable so the
  // encrypted passphrase backup can export it. Phase 6 exports it once, then
  // re-imports it as non-extractable for everyday use.
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);

  const record = {
    userId,
    deviceId,
    privateKey: pair.privateKey,
    publicKey: bytesToBase64Url(new Uint8Array(raw)),
    createdAt: Date.now(),
  };

  await saveDeviceKeyRecord(record);
  return record;
}

// A short, readable fingerprint of a public key: "AB12 CD34 EF56 7890".
// (Proper safety numbers for comparing two people arrive in Phase 7.)
export async function fingerprintOf(publicKey) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    base64UrlToBytes(publicKey),
  );

  const hex = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return hex.match(/.{4}/g).join(" ");
}

// Makes sure this browser has a key pair and the server holds its public key.
// Safe to call on every load: it only generates when the local key is missing,
// and only publishes when the server's copy is missing or different.
export async function ensureDeviceKey(userId) {
  const deviceId = getDeviceId();

  const work = async () => {
    let record = await getDeviceKeyRecord(userId);

    // No local key (first run, or browser data was cleared), or it belongs to
    // an older device id: make a fresh one.
    if (!record || record.deviceId !== deviceId) {
      record = await generateDeviceKey(userId, deviceId);
    }

    const { data } = await listMyDeviceKeysRequest();
    const onServer = data.keys.find((key) => key.deviceId === deviceId);

    if (!onServer || onServer.publicKey !== record.publicKey) {
      await publishDeviceKeyRequest({
        deviceId,
        publicKey: record.publicKey,
      });
    }

    return { deviceId, publicKey: record.publicKey };
  };

  // One tab at a time per user, so two tabs opening together can't each
  // generate their own key.
  if (navigator.locks?.request) {
    return navigator.locks.request(`threadline-e2ee:${userId}`, work);
  }

  return work();
}
