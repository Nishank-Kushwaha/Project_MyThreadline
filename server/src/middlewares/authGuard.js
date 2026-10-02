import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import env from "../config/env.js";

const jwtConfig = env.jwt;

function authGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, "Authentication required"));
  try {
    const payload = jwt.verify(token, jwtConfig.accessSecret);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export default authGuard;
