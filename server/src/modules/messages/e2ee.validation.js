import DeviceKey from "../../models/DeviceKey.js";
import ApiError from "../../utils/ApiError.js";

const MAX_KEYS = 40;
const MAX_CIPHERTEXT_LENGTH = 24000;

const isBase64Url = (value, length) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]+$/.test(value) &&
  (length === undefined || value.length === length);

const invalid = (message = "Invalid encrypted message") =>
  new ApiError(400, message);

// True once every member has registered at least one device key.
async function allMembersHaveDeviceKeys(room) {
  const memberIds = room.members.map((m) => m.userId);

  const withKeys = await DeviceKey.distinct("userId", {
    userId: { $in: memberIds },
  });

  return withKeys.length === memberIds.length;
}

// Checks the shape and the claims of an encrypted message and returns a clean
// copy (only known fields), so nothing unexpected is stored.
async function validateEnvelope(raw, { room, userId, deviceId }) {
  if (!raw || typeof raw !== "object" || raw.v !== 1) throw invalid();

  if (!deviceId || raw.senderDeviceId !== deviceId) {
    throw invalid("This message wasn't sent from your registered device");
  }

  if (
    !isBase64Url(raw.spk, 87) ||
    !isBase64Url(raw.iv, 16) ||
    !isBase64Url(raw.ciphertext) ||
    raw.ciphertext.length > MAX_CIPHERTEXT_LENGTH
  ) {
    throw invalid();
  }

  if (
    !Array.isArray(raw.keys) ||
    raw.keys.length === 0 ||
    raw.keys.length > MAX_KEYS
  ) {
    throw invalid();
  }

  const memberIds = new Set(room.members.map((m) => m.userId.toString()));
  const seen = new Set();

  const keys = raw.keys.map((entry) => {
    if (!entry || typeof entry !== "object") throw invalid();

    const { userId: entryUserId, deviceId: entryDeviceId } = entry;

    if (typeof entryUserId !== "string" || !memberIds.has(entryUserId)) {
      throw invalid();
    }
    if (
      typeof entryDeviceId !== "string" ||
      !/^[\w-]{1,100}$/.test(entryDeviceId)
    ) {
      throw invalid();
    }
    if (
      !isBase64Url(entry.epk, 87) ||
      !isBase64Url(entry.iv, 16) ||
      !isBase64Url(entry.wrapped, 64)
    ) {
      throw invalid();
    }

    const id = `${entryUserId}:${entryDeviceId}`;
    if (seen.has(id)) throw invalid();
    seen.add(id);

    return {
      userId: entryUserId,
      deviceId: entryDeviceId,
      epk: entry.epk,
      iv: entry.iv,
      wrapped: entry.wrapped,
    };
  });

  // The sender's key must be the one registered for that device.
  const senderKey = await DeviceKey.findOne({ userId, deviceId }).lean();

  if (!senderKey || senderKey.publicKey !== raw.spk) {
    throw invalid("Your device key isn't registered or has changed");
  }

  // The sender must be able to read it back, and so must every other member.
  if (!seen.has(`${userId}:${deviceId}`)) throw invalid();

  for (const memberId of memberIds) {
    if (memberId === userId) continue;

    const hasEntry = [...seen].some((id) => id.startsWith(`${memberId}:`));
    if (!hasEntry) throw invalid("The other person's devices are missing");
  }

  return {
    v: 1,
    senderDeviceId: deviceId,
    spk: raw.spk,
    iv: raw.iv,
    ciphertext: raw.ciphertext,
    keys,
  };
}

export { allMembersHaveDeviceKeys, validateEnvelope };
