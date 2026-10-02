import jwt from "jsonwebtoken";
import env from "../config/env.js";

const jwtConfig = env.jwt;

function generateAccessToken(userId) {
  return jwt.sign({ sub: userId }, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn,
  });
}
function generateRefreshToken(userId) {
  return jwt.sign({ sub: userId }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
  });
}
function generateTokenPair(userId) {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  };
}
function verifyRefreshToken(token) {
  return jwt.verify(token, jwtConfig.refreshSecret);
}

export {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyRefreshToken,
};
