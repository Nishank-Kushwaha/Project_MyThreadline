import { io } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "@/api/axios";

// One socket for the whole app; components get it through SocketContext.
let socket = null;
let lastRenewAt = 0;

export function connectSocket(accessToken, serverOrigin) {
  if (socket) return socket;

  socket = io(serverOrigin, {
    // A function, so every connect AND reconnect sends the CURRENT token, not
    // the one from the very first connection.
    auth: (callback) => callback({ token: getAccessToken() ?? accessToken }),
  });

  // The server's auth check rejected us (an expired token). socket.io does not
  // retry that by itself (socket.active becomes false), so renew the token and
  // reconnect by hand. The time check stops this from ever looping.
  socket.on("connect_error", async () => {
    if (!socket || socket.active) return;
    if (Date.now() - lastRenewAt < 5000) return;
    lastRenewAt = Date.now();

    try {
      await refreshAccessToken();
      socket?.connect();
    } catch {
      // Can't renew: the session is over. The REST interceptor handles logout.
    }
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
