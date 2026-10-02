// Socket.io's own "room" (socket.join) powers io.to(roomId).emit(...).
// It is separate from, but named after, our Room DB model.
function registerRoomHandlers(socket) {
  socket.on("room:join", (roomId) => socket.join(roomId));
  socket.on("room:leave", (roomId) => socket.leave(roomId));
}

export default registerRoomHandlers;
