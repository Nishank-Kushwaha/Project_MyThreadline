import bcrypt from "bcryptjs";
import User from "../../models/User.js";
import ApiError from "../../utils/ApiError.js";
import { generateTokenPair } from "../../utils/generateTokens.js";
import { THEME_IDS, DEFAULT_THEME } from "../../constants/themes.js";

const SALT_ROUNDS = 10;

async function registerUser({ name, email, password, theme }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing)
    throw new ApiError(409, "An account with this email already exists");

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    theme: THEME_IDS.includes(theme) ? theme : DEFAULT_THEME,
  });

  const tokens = generateTokenPair(user._id.toString());
  return { user: sanitizeUser(user), ...tokens };
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (!user || !user.password)
    throw new ApiError(401, "Invalid email or password");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, "Invalid email or password");

  const tokens = generateTokenPair(user._id.toString());
  return { user: sanitizeUser(user), ...tokens };
}

async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  return sanitizeUser(user);
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    status: user.status,
    lastSeen: user.lastSeen,
    theme: user.theme,
    notificationSettings: {
      enabled: user.notificationSettings?.enabled ?? true,
      showPreview: user.notificationSettings?.showPreview ?? true,
    },
  };
}

export default { registerUser, loginUser, getUserById, sanitizeUser };
