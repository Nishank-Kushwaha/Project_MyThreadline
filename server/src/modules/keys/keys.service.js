import { createECDH } from "node:crypto";
import DeviceKey from "../../models/DeviceKey.js";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";
import KeyBackup from "../../models/KeyBackup.js";

const MAX_DEVICES_PER_USER = 10;
const MAX_BACKUP_ENTRIES = 50;
const MIN_KDF_ITERATIONS = 600000;
const MAX_KDF_ITERATIONS = 2000000;

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

const isBase64Url = (value, { length, max = 600 } = {}) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]+$/.test(value) &&
  (length ? value.length === length : value.length > 0 && value.length <= max);

const invalidBackup = () => new ApiError(400, "Invalid backup data");

function validateKdf(kdf) {
  if (
    !kdf ||
    kdf.name !== "PBKDF2-SHA256" ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < MIN_KDF_ITERATIONS ||
    kdf.iterations > MAX_KDF_ITERATIONS ||
    !isBase64Url(kdf.salt, { length: 22 })
  ) {
    throw invalidBackup();
  }

  return { name: kdf.name, iterations: kdf.iterations, salt: kdf.salt };
}

function validateWrapped(wrapped) {
  if (
    !wrapped ||
    !isBase64Url(wrapped.iv, { length: 16 }) ||
    !isBase64Url(wrapped.ciphertext, { max: 400 })
  ) {
    throw invalidBackup();
  }

  return { iv: wrapped.iv, ciphertext: wrapped.ciphertext };
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object") throw invalidBackup();

  assertValidDeviceId(entry.deviceId);
  assertValidPublicKey(entry.publicKey);

  if (
    !isBase64Url(entry.epk, { length: 87 }) ||
    !isBase64Url(entry.iv, { length: 16 }) ||
    !isBase64Url(entry.sealed, { max: 400 })
  ) {
    throw invalidBackup();
  }

  return {
    deviceId: entry.deviceId,
    publicKey: entry.publicKey,
    epk: entry.epk,
    iv: entry.iv,
    sealed: entry.sealed,
  };
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
      return { key: shapeKey(created), created: true, changed: false };
    } catch (err) {
      if (err.code !== 11000) throw err;
      existing = await find(); // another request created it first
    }
  }

  // Same key again: nothing to do. A different key: record that it changed.
  let changed = false;

  if (existing.publicKey !== publicKey) {
    existing.publicKey = publicKey;
    existing.keyVersion += 1;
    await existing.save();
    changed = true;
  }

  return { key: shapeKey(existing), created: false, changed };
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

async function getBackup(userId) {
  const backup = await KeyBackup.findOne({ userId }).lean();
  if (!backup) return null;

  return {
    publicKey: backup.publicKey,
    kdf: backup.kdf,
    wrapped: backup.wrapped,
    entries: backup.entries,
    updatedAt: backup.updatedAt,
  };
}

async function createBackup(userId, { publicKey, kdf, wrapped, entry }) {
  assertValidPublicKey(publicKey);

  try {
    await KeyBackup.create({
      userId,
      publicKey,
      kdf: validateKdf(kdf),
      wrapped: validateWrapped(wrapped),
      entries: [validateEntry(entry)],
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "A backup already exists for this account");
    }
    throw err;
  }
}

// Adds one device key to an existing backup (a no-op if it's already there).
async function addBackupEntry(userId, entry) {
  const clean = validateEntry(entry);

  const backup = await KeyBackup.findOne({ userId });
  if (!backup) throw new ApiError(404, "There's no backup yet");

  if (backup.entries.some((e) => e.publicKey === clean.publicKey)) return;

  if (backup.entries.length >= MAX_BACKUP_ENTRIES) {
    throw new ApiError(409, "The backup is full");
  }

  backup.entries.push(clean);
  await backup.save();
}

// The server can't check the old passphrase (it never sees it). The browser
// proves it by successfully opening the old blob before sending the new one.
async function changeBackupPassphrase(userId, { kdf, wrapped }) {
  const result = await KeyBackup.updateOne(
    { userId },
    { kdf: validateKdf(kdf), wrapped: validateWrapped(wrapped) },
  );

  if (result.matchedCount === 0)
    throw new ApiError(404, "There's no backup yet");
}

// Every chat this user is in, for announcing a key change to the people in it.
async function getRoomIdsOf(userId) {
  const rooms = await Room.find({ "members.userId": userId })
    .select("_id")
    .lean();

  return rooms.map((room) => room._id.toString());
}

export {
  publishDeviceKey,
  listMyKeys,
  listUserKeys,
  removeDeviceKey,
  getBackup,
  createBackup,
  addBackupEntry,
  changeBackupPassphrase,
  getRoomIdsOf,
};
