import { v2 as cloudinary } from "cloudinary";
import env from "./env.js";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true, // always return https:// URLs
});

// The rest of the app works without Cloudinary; only avatar upload needs it.
// So instead of crashing at boot, uploads fail with a clear message (see utils/imageStorage.js).
export const isCloudinaryConfigured = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret,
);

export default cloudinary;
