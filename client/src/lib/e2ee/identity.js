import { getDeviceKeyRecord } from "./keyStore";

// This device's key pair, read from IndexedDB once and kept in memory.
let cached = null; // { userId, record }

export async function getIdentity(userId) {
  if (cached?.userId === userId) return cached.record;

  const record = await getDeviceKeyRecord(userId);
  if (!record) throw new Error("This browser has no device key");

  cached = { userId, record };
  return record;
}

export function clearIdentityCache() {
  cached = null;
}
