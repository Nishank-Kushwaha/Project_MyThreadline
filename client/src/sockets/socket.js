import { io } from "socket.io-client";

// One socket for the whole app; components get it through SocketContext.
let socket = null;

export function connectSocket(accessToken, serverOrigin) {
  if (socket) return socket;
  socket = io(serverOrigin, { auth: { token: accessToken } });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
