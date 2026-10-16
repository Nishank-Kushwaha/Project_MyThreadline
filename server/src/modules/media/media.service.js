import cloudinary, { isCloudinaryConfigured } from "../../config/cloudinary.js";
import ApiError from "../../utils/ApiError.js";

const MEDIA_FOLDER_ENCRYPTED = "threadline/media/encrypted";
const MEDIA_FOLDER_PLAIN = "threadline/media/plain";

/**
 * Uploads media (encrypted blob or unencrypted file) to Cloudinary.
 * - Encrypted blobs are saved with `resource_type: "raw"` so Cloudinary does not attempt any parsing or transformation.
 * - Plain media uses `resource_type: "auto"` to automatically detect images/documents/videos.
 */
export async function uploadMediaFile(
  buffer,
  { isEncrypted = false, originalname, mimetype } = {},
) {
  if (!isCloudinaryConfigured) {
    throw new ApiError(500, "Media upload is not configured on the server");
  }

  return new Promise((resolve, reject) => {
    const options = {
      folder: isEncrypted ? MEDIA_FOLDER_ENCRYPTED : MEDIA_FOLDER_PLAIN,
      resource_type: isEncrypted ? "raw" : "auto",
      use_filename: false,
      unique_filename: true,
    };

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
      });
    });

    stream.end(buffer);
  });
}
