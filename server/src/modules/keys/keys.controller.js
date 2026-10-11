import * as keysService from "./keys.service.js";

async function publishDeviceKey(req, res, next) {
  try {
    const { deviceId, publicKey } = req.body;

    const { key, created } = await keysService.publishDeviceKey(req.userId, {
      deviceId,
      publicKey,
    });

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

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

export { publishDeviceKey, listMyKeys, listUserKeys, removeDeviceKey };
