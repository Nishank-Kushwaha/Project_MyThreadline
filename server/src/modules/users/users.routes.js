import { Router } from "express";
import * as usersController from "./users.controller.js";
import authGuard from "../../middlewares/authGuard.js";
import upload from "../../middlewares/upload.js";

const router = Router();

// Every route below needs a logged-in user, so guard the whole router once
// instead of repeating authGuard on each line.
router.use(authGuard);

router.patch("/me", usersController.updateProfile);
router.patch("/me/password", usersController.changePassword);
router.post(
  "/me/avatar",
  upload.single("avatar"),
  usersController.uploadAvatar,
);
router.delete("/me/avatar", usersController.removeAvatar);
router.get("/", usersController.listUsers);
router.patch("/me/theme", usersController.updateTheme);

export default router;
