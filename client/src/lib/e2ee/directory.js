import { listUserDeviceKeysRequest } from "@/api/keysApi";
import { getRoomEncryptionRequest } from "@/api/roomsApi";

// Public keys change rarely, so they're cached briefly instead of being
// fetched for every message.
const TTL_MS = 30_000;

const cache = new Map(); // userId -> { keys, fetchedAt }
const inFlight = new Map(); // userId -> Promise

const roomCache = new Map(); // roomId -> { data, fetchedAt }
const roomInFlight = new Map(); // roomId -> Promise

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

// -> { encrypted, members: [{ userId, name, hasKeys }], devices: [{ userId, deviceId, publicKey }] }
export function getRoomEncryption(roomId, { force = false } = {}) {
  const cached = roomCache.get(roomId);

  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return Promise.resolve(cached.data);
  }

  if (roomInFlight.has(roomId)) return roomInFlight.get(roomId);

  const request = getRoomEncryptionRequest(roomId)
    .then(({ data }) => {
      const info = {
        encrypted: data.encrypted,
        members: data.members,
        devices: data.devices,
      };
      roomCache.set(roomId, { data: info, fetchedAt: Date.now() });
      return info;
    })
    .finally(() => roomInFlight.delete(roomId));

  roomInFlight.set(roomId, request);
  return request;
}

export function clearKeyDirectoryCache() {
  cache.clear();
  roomCache.clear();
}
// Call when someone joins or leaves, so the next send re-reads the member list.
export function clearRoomEncryptionCache(roomId) {
  if (roomId) roomCache.delete(roomId);
  else roomCache.clear();
}
