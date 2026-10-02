import jwt from "jsonwebtoken";
import env from "../../config/env.js";

// Sockets have no per-request headers, so the client sends the token in the
// handshake: io(url, { auth: { token } })
function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));

  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    socket.userId = payload.sub;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
}

export default socketAuth;
