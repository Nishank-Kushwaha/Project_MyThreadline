import User from "../../models/User.js";
import Message from "../../models/Message.js";

// When a user's LAST socket drops, wait this long before calling them offline.
// A page refresh disconnects and reconnects within a second or two; without
// this grace period, everyone would see the user flicker offline -> online.
export const PRESENCE_GRACE_MS = 2000;

// Messages sent while this user was offline become "delivered" now that they're back.
async function markPendingAsDelivered(socket, roomIds) {
  if (roomIds.length === 0) return;

  const filter = {
    roomId: { $in: roomIds },
    sender: { $ne: socket.userId },
    deliveredTo: { $ne: socket.userId },
  };

  // Capture the cutoff BEFORE updating, so we never claim delivery of a
  // message that was created after this moment.
  const upTo = new Date().toISOString();

  const affectedRoomIds = await Message.distinct("roomId", filter);
  if (affectedRoomIds.length === 0) return;

  await Message.updateMany(filter, {
    $addToSet: { deliveredTo: socket.userId },
  });

  // One event per room ("everything up to upTo is delivered to this user"),
  // not one per message. Senders' clients update all their ticks from it.
  for (const roomId of affectedRoomIds) {
    socket.to(roomId.toString()).emit("message:delivered", {
      roomId: roomId.toString(),
      userId: socket.userId,
      upTo,
    });
  }
}

// Called after the socket has joined its rooms.
export async function handleConnectPresence(io, socket, roomIds) {
  await User.findByIdAndUpdate(socket.userId, { status: "online" });

  if (roomIds.length > 0) {
    socket
      .to(roomIds)
      .emit("presence:update", { userId: socket.userId, status: "online" });
  }

  await markPendingAsDelivered(socket, roomIds);
}

export function handleDisconnectPresence(io, socket) {
  // Captured in the "disconnecting" event (see sockets/index.js), because by
  // the time "disconnect" fires the socket has already left all its rooms.
  const roomIds = socket.data.roomIds || [];
  const disconnectedAt = new Date();

  setTimeout(async () => {
    try {
      // Does this user still have another tab/device connected?
      // fetchSockets() asks the adapter, so it stays correct when we add
      // Redis for multiple server instances in Phase 5.
      const remaining = await io.in(`user:${socket.userId}`).fetchSockets();
      if (remaining.length > 0) return;

      await User.findByIdAndUpdate(socket.userId, {
        status: "offline",
        lastSeen: disconnectedAt,
      });

      if (roomIds.length > 0) {
        io.to(roomIds).emit("presence:update", {
          userId: socket.userId,
          status: "offline",
          lastSeen: disconnectedAt.toISOString(),
        });
      }
    } catch (err) {
      console.error("[socket] presence offline update failed:", err.message);
    }
  }, PRESENCE_GRACE_MS);
}
