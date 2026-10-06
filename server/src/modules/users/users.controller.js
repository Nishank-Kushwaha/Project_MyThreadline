import * as usersService from "./users.service.js";
import ApiError from "../../utils/ApiError.js";
import { THEME_IDS } from "../../constants/themes.js";

async function updateProfile(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      throw new ApiError(400, "Name must be at least 2 characters");
    }
    const user = await usersService.updateName(req.userId, name.trim());
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      throw new ApiError(400, "New password must be at least 6 characters");
    }
    const user = await usersService.updatePassword(
      req.userId,
      currentPassword,
      newPassword,
    );
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) throw new ApiError(400, "No image uploaded");
    const user = await usersService.updateAvatar(req.userId, req.file);
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function removeAvatar(req, res, next) {
  try {
    const user = await usersService.removeAvatar(req.userId);
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await usersService.listOtherUsers(req.userId);
    res.status(200).json({ success: true, users });
  } catch (err) {
    next(err);
  }
}

async function updateTheme(req, res, next) {
  try {
    const { theme } = req.body;
    if (!THEME_IDS.includes(theme)) throw new ApiError(400, "Invalid theme");
    const user = await usersService.updateTheme(req.userId, theme);
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

export {
  updateProfile,
  changePassword,
  uploadAvatar,
  removeAvatar,
  listUsers,
  updateTheme,
};
