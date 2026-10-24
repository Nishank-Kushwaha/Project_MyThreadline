import crypto from "crypto";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";

// 30 seconds ring timeout before automatically marking the call as unanswered/missed
const RING_TIMEOUT_MS = 30000;

// Active sessions: callId -> session
// Session shape: { callId, roomId, callerId, callerSocketId, calleeId, callType, status, createdAt, connectedAt, timer }
const activeCalls = new Map();

// Quick lookup: userId -> callId (ensures a user can only be in one call at a time)
const userCallMap = new Map();

function cleanupCallSession(callId) {
  const session = activeCalls.get(callId);
  if (!session) return null;

  if (session.timer) {
    clearTimeout(session.timer);
  }

  userCallMap.delete(session.callerId);
  userCallMap.delete(session.calleeId);
  activeCalls.delete(callId);

  return session;
}

function handleCallTimeout(io, callId) {
  const session = cleanupCallSession(callId);
  if (!session) return;

  console.log(`[call] Call ${callId} timed out after ${RING_TIMEOUT_MS / 1000}s`);

  // Notify caller that call was unanswered
  io.to(`user:${session.callerId}`).emit("call:timeout", {
    callId,
    reason: "no-answer",
  });

  // Notify callee to dismiss ringing modal
  io.to(`user:${session.calleeId}`).emit("call:cancelled", {
    callId,
    reason: "missed",
  });
}

function registerCallHandlers(io, socket) {
  // 1. INITIATE CALL
  socket.on(
    "call:initiate",
    async ({ targetUserId, roomId, callType = "video" }, callback) => {
      try {
        if (!targetUserId || !roomId) {
          throw new ApiError(400, "targetUserId and roomId are required");
        }

        if (targetUserId === socket.userId) {
          throw new ApiError(400, "Cannot call yourself");
        }

        // Signaling Authorization: Verify caller and callee share this room
        const room = await Room.findOne({
          _id: roomId,
          "members.userId": { $all: [socket.userId, targetUserId] },
        });

        if (!room) {
          throw new ApiError(
            403,
            "You are not allowed to call users outside of shared conversations",
          );
        }

        // Check if caller is already in an active call
        if (userCallMap.has(socket.userId)) {
          return callback?.({
            success: false,
            reason: "already-in-call",
            message: "You are already on an active call",
          });
        }

        // Check if callee is already busy in another call
        if (userCallMap.has(targetUserId)) {
          return callback?.({
            success: false,
            reason: "busy",
            message: "The user is currently on another call",
          });
        }

        // Check if callee is online on any socket
        const targetSockets = await io.in(`user:${targetUserId}`).fetchSockets();
        if (targetSockets.length === 0) {
          return callback?.({
            success: false,
            reason: "offline",
            message: "User is currently offline",
          });
        }

        const callId = crypto.randomUUID();

        // Create call session
        const session = {
          callId,
          roomId,
          callerId: socket.userId,
          callerSocketId: socket.id,
          calleeId: targetUserId,
          callType,
          status: "ringing",
          createdAt: Date.now(),
          connectedAt: null,
          timer: setTimeout(() => handleCallTimeout(io, callId), RING_TIMEOUT_MS),
        };

        activeCalls.set(callId, session);
        userCallMap.set(socket.userId, callId);
        userCallMap.set(targetUserId, callId);

        // Notify callee across all their active tabs/devices
        io.to(`user:${targetUserId}`).emit("call:incoming", {
          callId,
          roomId,
          caller: {
            _id: socket.userId,
            name: socket.userName || "User",
            avatarUrl: socket.userAvatarUrl || "",
          },
          callType,
        });

        callback?.({ success: true, callId });
      } catch (err) {
        callback?.({ success: false, message: err.message });
      }
    },
  );

  // 2. CANCEL CALL (Caller hangs up before callee answers)
  socket.on("call:cancel", ({ callId }, callback) => {
    try {
      const session = activeCalls.get(callId);
      if (!session || session.callerId !== socket.userId) {
        return callback?.({ success: false, message: "Call not found" });
      }

      cleanupCallSession(callId);

      // Tell callee to stop ringing
      io.to(`user:${session.calleeId}`).emit("call:cancelled", { callId });

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // 3. ACCEPT CALL (Callee answers)
  socket.on("call:accept", ({ callId }, callback) => {
    try {
      const session = activeCalls.get(callId);
      if (!session || session.calleeId !== socket.userId) {
        return callback?.({ success: false, message: "Call session not found" });
      }

      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }

      session.status = "connected";
      session.connectedAt = Date.now();

      // Dismiss ringing on any other open tabs the callee has
      socket.to(`user:${socket.userId}`).emit("call:answered-elsewhere", { callId });

      // Notify caller that call was accepted
      io.to(`user:${session.callerId}`).emit("call:accepted", {
        callId,
        calleeId: socket.userId,
      });

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // 4. REJECT / DECLINE CALL (Callee rejects)
  socket.on("call:reject", ({ callId, reason = "declined" }, callback) => {
    try {
      const session = activeCalls.get(callId);
      if (!session || session.calleeId !== socket.userId) {
        return callback?.({ success: false, message: "Call session not found" });
      }

      cleanupCallSession(callId);

      // Notify caller of rejection
      io.to(`user:${session.callerId}`).emit("call:rejected", {
        callId,
        reason,
      });

      // Dismiss on other callee tabs
      socket.to(`user:${socket.userId}`).emit("call:cancelled", { callId });

      callback?.({ success: true });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // 5. SDP OFFER (Relayed from Caller to Callee)
  socket.on("call:sdp-offer", ({ callId, sdp }) => {
    const session = activeCalls.get(callId);
    if (!session) return;

    const targetUserId =
      socket.userId === session.callerId ? session.calleeId : session.callerId;

    io.to(`user:${targetUserId}`).emit("call:sdp-offer", { callId, sdp });
  });

  // 6. SDP ANSWER (Relayed from Callee to Caller)
  socket.on("call:sdp-answer", ({ callId, sdp }) => {
    const session = activeCalls.get(callId);
    if (!session) return;

    const targetUserId =
      socket.userId === session.callerId ? session.calleeId : session.callerId;

    io.to(`user:${targetUserId}`).emit("call:sdp-answer", { callId, sdp });
  });

  // 7. ICE CANDIDATE EXCHANGE
  socket.on("call:ice-candidate", ({ callId, candidate }) => {
    const session = activeCalls.get(callId);
    if (!session) return;

    const targetUserId =
      socket.userId === session.callerId ? session.calleeId : session.callerId;

    io.to(`user:${targetUserId}`).emit("call:ice-candidate", {
      callId,
      candidate,
    });
  });

  // 8. MEDIA TOGGLE NOTIFICATION (mic mute / camera off)
  socket.on("call:media-toggle", ({ callId, kind, enabled }) => {
    const session = activeCalls.get(callId);
    if (!session) return;

    const targetUserId =
      socket.userId === session.callerId ? session.calleeId : session.callerId;

    io.to(`user:${targetUserId}`).emit("call:media-toggle", {
      callId,
      kind,
      enabled,
    });
  });

  // 9. END CALL (Either party hangs up during active call)
  socket.on("call:end", ({ callId }, callback) => {
    try {
      const session = activeCalls.get(callId);
      if (!session) {
        return callback?.({ success: true });
      }

      const durationSec = session.connectedAt
        ? Math.floor((Date.now() - session.connectedAt) / 1000)
        : 0;

      cleanupCallSession(callId);

      const targetUserId =
        socket.userId === session.callerId ? session.calleeId : session.callerId;

      io.to(`user:${targetUserId}`).emit("call:ended", {
        callId,
        duration: durationSec,
      });

      callback?.({ success: true, duration: durationSec });
    } catch (err) {
      callback?.({ success: false, message: err.message });
    }
  });

  // 10. ABRUPT DISCONNECT CLEANUP
  socket.on("disconnect", () => {
    const activeCallId = userCallMap.get(socket.userId);
    if (!activeCallId) return;

    const session = activeCalls.get(activeCallId);
    if (!session) return;

    // Check if user still has other connected sockets before tearing down call
    io.in(`user:${socket.userId}`)
      .fetchSockets()
      .then((remainingSockets) => {
        if (remainingSockets.length === 0) {
          const durationSec = session.connectedAt
            ? Math.floor((Date.now() - session.connectedAt) / 1000)
            : 0;

          cleanupCallSession(activeCallId);

          const otherUserId =
            socket.userId === session.callerId
              ? session.calleeId
              : session.callerId;

          io.to(`user:${otherUserId}`).emit("call:peer-disconnected", {
            callId: activeCallId,
            duration: durationSec,
          });
        }
      })
      .catch((err) => {
        console.error("[call] error checking remaining sockets on disconnect:", err);
      });
  });
}

export default registerCallHandlers;
