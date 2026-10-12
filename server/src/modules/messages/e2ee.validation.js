import DeviceKey from "../../models/DeviceKey.js";
import ApiError from "../../utils/ApiError.js";

// 50 members x a few devices each, with room to spare.
const MAX_KEYS = 250;
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

// A message (or last-message preview) as one person should receive it: the
// locked keys are trimmed to that person's own entries. Everyone else's device
// ids and locks are none of their business, and it keeps group messages small.
function viewForUser(message, userId) {
  if (!message?.e2ee?.keys) return message;

  return {
    ...message,
    e2ee: {
      ...message.e2ee,
      keys: message.e2ee.keys.filter((key) => key.userId === userId),
    },
  };
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

  const memberIds = room.members.map((m) => m.userId.toString());
  const memberSet = new Set(memberIds);

  // The registered devices of the CURRENT members: the only ones a message can
  // be locked for.
  const registered = await DeviceKey.find({ userId: { $in: memberIds } })
    .select("userId deviceId publicKey")
    .lean();

  const registeredIds = new Set(
    registered.map((key) => `${key.userId}:${key.deviceId}`),
  );
  const membersWithDevices = new Set(
    registered.map((key) => key.userId.toString()),
  );

  const seen = new Set();
  const keys = [];

  for (const entry of raw.keys) {
    if (!entry || typeof entry !== "object") throw invalid();

    const { userId: entryUserId, deviceId: entryDeviceId } = entry;

    if (
      typeof entryUserId !== "string" ||
      !/^[0-9a-f]{24}$/.test(entryUserId)
    ) {
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

    // Locks for someone who just left the group, or for a device that no
    // longer exists, are dropped instead of stored.
    if (!memberSet.has(entryUserId) || !registeredIds.has(id)) continue;

    keys.push({
      userId: entryUserId,
      deviceId: entryDeviceId,
      epk: entry.epk,
      iv: entry.iv,
      wrapped: entry.wrapped,
    });
  }

  // The sender's key must be the one registered for that device.
  const senderKey = registered.find(
    (key) => key.userId.toString() === userId && key.deviceId === deviceId,
  );

  if (!senderKey || senderKey.publicKey !== raw.spk) {
    throw invalid("Your device key isn't registered or has changed");
  }

  // The sender must be able to read it back...
  if (!keys.some((key) => key.userId === userId && key.deviceId === deviceId)) {
    throw invalid();
  }

  // ...and so must every member who has a device. If someone joined while the
  // sender was encrypting, their list was out of date: ask for a retry.
  for (const memberId of membersWithDevices) {
    if (!keys.some((key) => key.userId === memberId)) {
      throw invalid("Group members changed. Please try again.");
    }
  }

  // In a private chat both people must have a device, or nobody could read it.
  if (room.type === "private" && membersWithDevices.size !== memberSet.size) {
    throw invalid("The other person hasn't set up encryption yet");
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

export { allMembersHaveDeviceKeys, validateEnvelope, viewForUser };
