import ApiError from "../utils/ApiError.js";

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  let statusCode =
    err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  let message = err.message || "Internal server error";
  let isExpected = err.isOperational;

  // Thrown by multer when a file exceeds the size limit in middlewares/upload.js
  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = "Image must be 3MB or smaller";
    isExpected = true;
  }

  if (!isExpected) {
    console.error("[unexpected error]", err);
  }

  res.status(statusCode).json({ success: false, message });
}

export { notFound, errorHandler };
