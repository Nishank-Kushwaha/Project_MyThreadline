import { Server } from "socket.io";
import env from "../config/env.js";
import socketAuth from "./middlewares/socketAuth.js";
import registerRoomHandlers from "./handlers/room.handler.js";
import registerMessageHandlers from "./handlers/message.handler.js";
import registerTypingHandlers from "./handlers/typing.handler.js";
import {
  handleConnectPresence,
  handleDisconnectPresence,
} from "./handlers/presence.handler.js";
import Room from "../models/Room.js";
import User from "../models/User.js";

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use(socketAuth);

  io.on("connection", async (socket) => {
    console.log(`[socket] connected: user ${socket.userId} (${socket.id})`);

    // Personal channel: lets the server push to ONE user across all their tabs.
    socket.join(`user:${socket.userId}`);

    // Register listeners FIRST, synchronously, so an early client event
    // can't arrive before its handler exists.
    registerRoomHandlers(socket);
    registerMessageHandlers(io, socket);
    registerTypingHandlers(socket);

    // "disconnecting" fires while the socket is still in its rooms; by the time
    // "disconnect" fires they're gone. Grab the room list now for presence.
    socket.on("disconnecting", () => {
      socket.data.roomIds = [...socket.rooms].filter(
        (r) => r !== socket.id && !r.startsWith("user:"),
      );
    });

    socket.on("disconnect", () => {
      console.log(
        `[socket] disconnected: user ${socket.userId} (${socket.id})`,
      );
      handleDisconnectPresence(io, socket);
    });

    try {
      const [rooms, me] = await Promise.all([
        Room.find({ "members.userId": socket.userId }).select("_id").lean(),
        User.findById(socket.userId).select("name").lean(),
      ]);

      socket.userName = me?.name; // used by the typing indicator

      const roomIds = rooms.map((room) => room._id.toString());
      roomIds.forEach((id) => socket.join(id));

      await handleConnectPresence(io, socket, roomIds);
    } catch (err) {
      console.error("[socket] connection setup failed:", err.message);
    }
  });

  return io;
}

export default initSocket;
