import { Router } from "express";
import passport from "passport";
import * as authController from "./auth.controller.js";
import authGuard from "../../middlewares/authGuard.js";
import env from "../../config/env.js";

const { clientUrl } = env;
const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/refresh", authController.refresh);
router.get("/me", authGuard, authController.me);

// Step 1: kick off the Google consent screen. session:false because we
// authenticate with our own JWTs, not passport sessions.
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

// Step 2: Google redirects back here. On failure, bounce to the login page
// with an error flag the frontend can show a message for.
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${clientUrl}/login?error=google`,
  }),
  authController.googleCallback,
);

export default router;
