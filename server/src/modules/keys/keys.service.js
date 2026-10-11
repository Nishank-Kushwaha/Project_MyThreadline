import { createECDH } from "node:crypto";
import DeviceKey from "../../models/DeviceKey.js";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";

const MAX_DEVICES_PER_USER = 10;

function shapeKey(key) {
  return {
    deviceId: key.deviceId,
    publicKey: key.publicKey,
    keyVersion: key.keyVersion,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

function assertValidDeviceId(deviceId) {
  if (typeof deviceId !== "string" || !/^[\w-]{1,100}$/.test(deviceId)) {
    throw new ApiError(400, "Invalid device id");
  }
}

// A real P-256 public key: 0x04 + 32-byte X + 32-byte Y, and an actual point
// on the curve. Checking the curve stops junk and "invalid curve" tricks from
// ever being stored and handed to other users.
function assertValidPublicKey(publicKey) {
  if (typeof publicKey !== "string" || !/^[A-Za-z0-9_-]+$/.test(publicKey)) {
    throw new ApiError(400, "Invalid public key");
  }

  const bytes = Buffer.from(publicKey, "base64url");

  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new ApiError(400, "Invalid public key");
  }

  try {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    ecdh.computeSecret(bytes); // throws if the point isn't on the curve
  } catch {
    throw new ApiError(400, "Invalid public key");
  }
}

// Called by the browser after it creates (or re-creates) its key pair.
async function publishDeviceKey(userId, { deviceId, publicKey }) {
  assertValidDeviceId(deviceId);
  assertValidPublicKey(publicKey);

  const find = () => DeviceKey.findOne({ userId, deviceId });
  let existing = await find();

  if (!existing) {
    const count = await DeviceKey.countDocuments({ userId });

    if (count >= MAX_DEVICES_PER_USER) {
      throw new ApiError(
        409,
        `You can register up to ${MAX_DEVICES_PER_USER} devices. Remove one you no longer use.`,
      );
    }

    try {
      const created = await DeviceKey.create({ userId, deviceId, publicKey });
      return { key: shapeKey(created), created: true };
    } catch (err) {
      if (err.code !== 11000) throw err;
      existing = await find(); // another request created it first
    }
  }

  // Same key again: nothing to do. A different key: record that it changed.
  if (existing.publicKey !== publicKey) {
    existing.publicKey = publicKey;
    existing.keyVersion += 1;
    await existing.save();
  }

  return { key: shapeKey(existing), created: false };
}

async function listMyKeys(userId) {
  const keys = await DeviceKey.find({ userId }).sort({ createdAt: 1 }).lean();
  return keys.map(shapeKey);
}

// Another user's keys, only if you share a chat with them (so the directory
// can't be harvested by anyone who has an account).
async function listUserKeys(requesterId, targetId) {
  if (requesterId !== targetId) {
    const sharesRoom = await Room.exists({
      "members.userId": { $all: [requesterId, targetId] },
    });

    if (!sharesRoom) {
      throw new ApiError(403, "You don't share a chat with that user");
    }
  }

  return listMyKeys(targetId);
}

async function removeDeviceKey(userId, deviceId) {
  const result = await DeviceKey.deleteOne({ userId, deviceId });

  if (result.deletedCount === 0) {
    throw new ApiError(404, "Device not found");
  }
}

export { publishDeviceKey, listMyKeys, listUserKeys, removeDeviceKey };
