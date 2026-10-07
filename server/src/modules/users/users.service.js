import bcrypt from "bcryptjs";
import User from "../../models/User.js";
import ApiError from "../../utils/ApiError.js";
import authService from "../auth/auth.service.js";
import { uploadAvatarImage, deleteImage } from "../../utils/imageStorage.js";

async function updateName(userId, name) {
  const user = await User.findByIdAndUpdate(
    userId,
    { name },
    { new: true, runValidators: true },
  );
  if (!user) throw new ApiError(404, "User not found");
  return authService.sanitizeUser(user);
}

async function updatePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  if (user.password) {
    // Manual account — must prove they know the current password.
    const isMatch = await bcrypt.compare(currentPassword || "", user.password);
    if (!isMatch) throw new ApiError(401, "Current password is incorrect");
  }
  // Google-only account setting a password for the first time — no "current" to check.

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  return authService.sanitizeUser(user);
}

async function updateAvatar(userId, file) {
  const existing = await User.findById(userId).select("avatarPublicId").lean();
  if (!existing) throw new ApiError(404, "User not found");

  // 1) Upload the new image.
  let uploaded;
  try {
    uploaded = await uploadAvatarImage(file.buffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[cloudinary] upload failed:", err.message);
    throw new ApiError(502, "Couldn't upload that image. Please try again.");
  }

  // 2) Point the user at it. If saving fails, don't leave the new image orphaned.
  let user;
  try {
    user = await User.findByIdAndUpdate(
      userId,
      { avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId },
      { new: true },
    );
    if (!user) throw new ApiError(404, "User not found");
  } catch (err) {
    await deleteImage(uploaded.publicId).catch(() => {});
    throw err;
  }

  // 3) Delete the previous image. The user already has their new photo, so a
  //    failure here is logged but doesn't fail the request.
  if (existing.avatarPublicId) {
    try {
      await deleteImage(existing.avatarPublicId);
    } catch (err) {
      console.error(
        "[cloudinary] couldn't delete old avatar",
        existing.avatarPublicId,
        err.message,
      );
    }
  }

  return authService.sanitizeUser(user);
}

async function removeAvatar(userId) {
  const existing = await User.findById(userId).select("avatarPublicId").lean();
  if (!existing) throw new ApiError(404, "User not found");

  // Google-provided photos have no avatarPublicId (they were never stored by us),
  // so there is nothing to delete, we only clear the reference.
  if (existing.avatarPublicId) {
    try {
      await deleteImage(existing.avatarPublicId);
    } catch (err) {
      console.error(
        "[cloudinary] couldn't delete avatar",
        existing.avatarPublicId,
        err.message,
      );
      throw new ApiError(502, "Couldn't remove your photo. Please try again.");
    }
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { avatarUrl: "", avatarPublicId: "" },
    { new: true },
  );
  if (!user) throw new ApiError(404, "User not found");
  return authService.sanitizeUser(user);
}

async function listOtherUsers(currentUserId) {
  return User.find({ _id: { $ne: currentUserId } })
    .select("name email avatarUrl status")
    .lean();
}

async function updateTheme(userId, theme) {
  const user = await User.findByIdAndUpdate(
    userId,
    { theme },
    { new: true, runValidators: true },
  );
  if (!user) throw new ApiError(404, "User not found");
  return authService.sanitizeUser(user);
}

async function updateNotificationSettings(userId, { enabled, showPreview }) {
  // Only touch the keys that were sent.
  const update = {};
  if (enabled !== undefined) update["notificationSettings.enabled"] = enabled;
  if (showPreview !== undefined) {
    update["notificationSettings.showPreview"] = showPreview;
  }

  const user = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new ApiError(404, "User not found");
  return authService.sanitizeUser(user);
}

export {
  updateName,
  updatePassword,
  updateAvatar,
  removeAvatar,
  listOtherUsers,
  updateTheme,
  updateNotificationSettings,
};
