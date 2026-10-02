import multer from "multer";
import ApiError from "../utils/ApiError.js";

// Only these. (Not "any image/*": that would also let SVG through, which can carry scripts.)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function imageFilter(req, file, cb) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, "Only JPG, PNG or WebP images are allowed"));
  }
  cb(null, true);
}

const upload = multer({
  // memoryStorage keeps the file as a Buffer in req.file.buffer: nothing is
  // ever written to the server's disk. We hand that buffer straight to Cloudinary.
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

export default upload;
