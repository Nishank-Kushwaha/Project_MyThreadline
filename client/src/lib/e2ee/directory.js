import { listUserDeviceKeysRequest } from "@/api/keysApi";

// Public keys change rarely, so they're cached briefly instead of being
// fetched for every message.
const TTL_MS = 30_000;

const cache = new Map(); // userId -> { keys, fetchedAt }
const inFlight = new Map(); // userId -> Promise

// -> [{ userId, deviceId, publicKey, keyVersion, ... }]
export function getUserDeviceKeys(userId, { force = false } = {}) {
  const cached = cache.get(userId);

  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return Promise.resolve(cached.keys);
  }

  if (inFlight.has(userId)) return inFlight.get(userId);

  const request = listUserDeviceKeysRequest(userId)
    .then(({ data }) => {
      const keys = data.keys.map((key) => ({ ...key, userId }));
      cache.set(userId, { keys, fetchedAt: Date.now() });
      return keys;
    })
    .finally(() => inFlight.delete(userId));

  inFlight.set(userId, request);
  return request;
}

export function clearKeyDirectoryCache() {
  cache.clear();
}
