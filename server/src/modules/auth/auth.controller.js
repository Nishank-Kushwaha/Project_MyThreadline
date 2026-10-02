import authService from "./auth.service.js";
import ApiError from "../../utils/ApiError.js";
import env from "../../config/env.js";
import {
  generateAccessToken,
  verifyRefreshToken,
  generateTokenPair,
} from "../../utils/generateTokens.js";

const { nodeEnv, clientUrl } = env;

const REFRESH_COOKIE_NAME = "refreshToken";

const refreshCookieOptions = {
  httpOnly: true,
  secure: nodeEnv === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      throw new ApiError(400, "Name, email and password are required");
    if (password.length < 6)
      throw new ApiError(400, "Password must be at least 6 characters");

    const { user, accessToken, refreshToken } = await authService.registerUser({
      name,
      email,
      password,
    });
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(201).json({ success: true, user, accessToken });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      throw new ApiError(400, "Email and password are required");

    const { user, accessToken, refreshToken } = await authService.loginUser({
      email,
      password,
    });
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.status(200).json({ success: true, user, accessToken });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getUserById(req.userId);
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
  res.status(200).json({ success: true, message: "Logged out" });
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new ApiError(401, "No refresh token");
    const payload = verifyRefreshToken(token);
    const accessToken = generateAccessToken(payload.sub);
    res.status(200).json({ success: true, accessToken });
  } catch (err) {
    next(new ApiError(401, "Session expired, please log in again"));
  }
}

// Runs after passport's "google" strategy has already verified the user
// and attached it to req.user (see config/passport.js). We just issue our
// own JWT pair the same way register/login do, then hand off to the
// frontend via a redirect carrying the access token.
async function googleCallback(req, res, next) {
  try {
    const { accessToken, refreshToken } = generateTokenPair(
      req.user._id.toString(),
    );
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
    res.redirect(`${clientUrl}/oauth-callback?accessToken=${accessToken}`);
  } catch (err) {
    next(err);
  }
}

export { register, login, me, logout, refresh, googleCallback };
