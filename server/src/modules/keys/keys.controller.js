import * as keysService from "./keys.service.js";

// Tells everyone who shares a chat with this user that their keys changed, so
// open chats re-check their security codes right away. Never throws.
async function announceKeyChange(req, userId) {
  try {
    const io = req.app.get("io");
    if (!io) return;

    const roomIds = await keysService.getRoomIdsOf(userId);

    for (const roomId of roomIds) {
      io.to(roomId).emit("keys:changed", { roomId, userId });
    }
  } catch (err) {
    console.error("[keys] couldn't announce a key change:", err.message);
  }
}

async function publishDeviceKey(req, res, next) {
  try {
    const { deviceId, publicKey } = req.body;

    const { key, created, changed } = await keysService.publishDeviceKey(
      req.userId,
      { deviceId, publicKey },
    );

    // Not awaited: the browser doesn't need to wait for the announcement.
    if (created || changed) announceKeyChange(req, req.userId);

    res.status(created ? 201 : 200).json({
      success: true,
      key,
    });
  } catch (err) {
    next(err);
  }
}
async function listMyKeys(req, res, next) {
  try {
    const keys = await keysService.listMyKeys(req.userId);

    res.status(200).json({
      success: true,
      keys,
    });
  } catch (err) {
    next(err);
  }
}

async function listUserKeys(req, res, next) {
  try {
    const keys = await keysService.listUserKeys(req.userId, req.params.userId);

    res.status(200).json({
      success: true,
      keys,
    });
  } catch (err) {
    next(err);
  }
}

async function removeDeviceKey(req, res, next) {
  try {
    await keysService.removeDeviceKey(req.userId, req.params.deviceId);

    announceKeyChange(req, req.userId);

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function getBackup(req, res, next) {
  try {
    const backup = await keysService.getBackup(req.userId);

    res.status(200).json({
      success: true,
      backup,
    });
  } catch (err) {
    next(err);
  }
}

async function createBackup(req, res, next) {
  try {
    await keysService.createBackup(req.userId, req.body);

    res.status(201).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function addBackupEntry(req, res, next) {
  try {
    await keysService.addBackupEntry(req.userId, req.body.entry);

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function changeBackupPassphrase(req, res, next) {
  try {
    await keysService.changeBackupPassphrase(req.userId, req.body);

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
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
};
