// Typing indicators are ephemeral: no database, just a relay.
// socket.to(roomId) sends to everyone in the room EXCEPT the sender.
function registerTypingHandlers(socket) {
  const relay =
    (event) =>
    ({ roomId } = {}) => {
      // socket.rooms is in-memory, so this membership check costs no DB query.
      if (!roomId || !socket.rooms.has(roomId)) return;

      socket.to(roomId).emit(event, {
        roomId,
        userId: socket.userId,
        name: socket.userName || "Someone", // loaded from the DB at connect time, not trusted from the client
      });
    };

  socket.on("typing:start", relay("typing:start"));
  socket.on("typing:stop", relay("typing:stop"));
}

export default registerTypingHandlers;
