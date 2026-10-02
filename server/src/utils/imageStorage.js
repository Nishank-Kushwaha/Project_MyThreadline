import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import ApiError from "./ApiError.js";

const AVATAR_FOLDER = "threadline/avatars";

// Uploads an image held in memory (a Buffer from multer) and resolves to
// { url, publicId }. The publicId is what we store so we can delete it later.
export async function uploadAvatarImage(buffer) {
  if (!isCloudinaryConfigured) {
    throw new ApiError(500, "Image uploads are not configured on the server");
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: AVATAR_FOLDER,
        resource_type: "image",
        // Applied BEFORE storing: we keep a 256x256 avatar, not a 3MB original.
        // gravity "auto" crops around the most interesting part of the photo.
        transformation: [
          {
            width: 256,
            height: 256,
            crop: "fill",
            gravity: "auto",
            quality: "auto",
          },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

// Deletes a stored image. Throws if it could not be deleted, so callers that care
// (like "remove my photo") can tell the user instead of pretending it worked.
// invalidate:true also purges Cloudinary's CDN copies so the URL stops being served.
export async function deleteImage(publicId) {
  if (!publicId) return;
  if (!isCloudinaryConfigured) {
    throw new ApiError(500, "Image storage is not configured on the server");
  }

  const res = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  // "not found" is fine: the image is already gone (e.g. a retry after a half-finished attempt).
  if (res?.result !== "ok" && res?.result !== "not found") {
    throw new Error(`Cloudinary destroy returned "${res?.result}"`);
  }
}
