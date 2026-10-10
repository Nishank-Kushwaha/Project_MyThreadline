import * as pushService from "./push.service.js";
import ApiError from "../../utils/ApiError.js";

async function getPublicKey(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      publicKey: pushService.getPublicKey(),
    });
  } catch (err) {
    next(err);
  }
}

async function subscribe(req, res, next) {
  try {
    await pushService.saveSubscription(
      req.userId,
      req.body.subscription,
      req.body.deviceId,
    );

    res.status(201).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function unsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      throw new ApiError(400, "endpoint is required");
    }

    await pushService.removeSubscription(req.userId, endpoint);

    res.status(200).json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

export { getPublicKey, subscribe, unsubscribe };
