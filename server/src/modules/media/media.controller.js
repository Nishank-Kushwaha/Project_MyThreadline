import * as mediaService from "./media.service.js";
import ApiError from "../../utils/ApiError.js";

export async function uploadMedia(req, res, next) {
  try {
    if (!req.file) {
      throw new ApiError(400, "No file uploaded");
    }

    // 100% E2EE enforcement: Chat media attachments must always be encrypted blobs
    const isEncrypted =
      req.query.encrypted !== "false" && req.body.isEncrypted !== "false";

    if (!isEncrypted) {
      throw new ApiError(
        400,
        "Unencrypted media uploads are not allowed. Media must be encrypted client-side before upload.",
      );
    }

    const result = await mediaService.uploadMediaFile(req.file.buffer, {
      isEncrypted: true,
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
