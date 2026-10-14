import { getDeviceKeyRecord, listHistoryKeys } from "./keyStore";

// This device's key pair, read from IndexedDB once and kept in memory.
let cached = null; // { userId, record }
let cachedHistory = null; // { userId, keys }

// For sending: the current device key.
export async function getIdentity(userId) {
  if (cached?.userId === userId) return cached.record;

  const record = await getDeviceKeyRecord(userId);
  if (!record) throw new Error("This browser has no device key");

  cached = { userId, record };
  return record;
}

// For reading: every key this browser can open messages with. The current key
// comes first, then the keys of older devices restored from the backup.
export async function getDecryptionIdentity(userId) {
  const current = await getIdentity(userId);

  if (cachedHistory?.userId !== userId) {
    cachedHistory = { userId, keys: await listHistoryKeys(userId) };
  }

  return {
    userId,
    keys: [
      { deviceId: current.deviceId, privateKey: current.privateKey },
      ...cachedHistory.keys.map((key) => ({
        deviceId: key.deviceId,
        privateKey: key.privateKey,
      })),
    ],
  };
}

export function clearIdentityCache() {
  cached = null;
  cachedHistory = null;
}
