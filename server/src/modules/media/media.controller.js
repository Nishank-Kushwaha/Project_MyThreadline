import * as mediaService from "./media.service.js";
import ApiError from "../../utils/ApiError.js";

export async function uploadMedia(req, res, next) {
  try {
    if (!req.file) {
      throw new ApiError(400, "No file uploaded");
    }

    const isEncrypted =
      req.query.encrypted === "true" || req.body.isEncrypted === "true";

    const result = await mediaService.uploadMediaFile(req.file.buffer, {
      isEncrypted,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    res.status(200).json({
      success: true,
      url: result.url,
      publicId: result.publicId,
    });
  } catch (err) {
    next(err);
  }
}
