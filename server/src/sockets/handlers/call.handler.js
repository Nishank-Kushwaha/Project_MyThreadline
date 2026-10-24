import crypto from "crypto";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";

const RING_TIMEOUT_MS = 30000;
const DISCONNECT_GRACE_MS = 10000; // survive brief network blips / socket reconnects
const MAX_SDP_LENGTH = 100_000;
const CALL_TYPES = new Set(["audio", "video"]);
const MEDIA_KINDS = new Set(["audio", "video"]);

// NOTE: in-memory state => single server instance only.
// For multiple instances use sticky sessions + the socket.io Redis adapter,
// and move these maps into Redis.
const activeCalls = new Map(); // callId -> session
const userCallMap = new Map(); // userId -> callId

const asId = (v) => (v === undefined || v === null ? "" : String(v));
const isStr = (v, max = 200) =>
  typeof v === "string" && v.length > 0 && v.length <= max;

function cleanupCallSession(callId) {
  const session = activeCalls.get(callId);
  if (!session) return null;
  if (session.timer) clearTimeout(session.timer);
  if (userCallMap.get(session.callerId) === callId)
    userCallMap.delete(session.callerId);
  if (userCallMap.get(session.calleeId) === callId)
    userCallMap.delete(session.calleeId);
  activeCalls.delete(callId);
  return session;
}

/** Returns the other participant's id, or null if `userId` is not part of the call. */
function peerOf(session, userId) {
  if (session.callerId === userId) return session.calleeId;
  if (session.calleeId === userId) return session.callerId;
  return null;
}

function safeError(err) {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

function handleCallTimeout(io, callId) {
  const session = cleanupCallSession(callId);
  if (!session) return;
  console.log(`[call] ${callId} timed out`);
  io.to(`user:${session.callerId}`).emit("call:timeout", {
    callId,
    reason: "no-answer",
  });
  io.to(`user:${session.calleeId}`).emit("call:cancelled", {
    callId,
    reason: "missed",
  });
}

function registerCallHandlers(io, socket) {
  // Relay helper for signaling: only participants of a CONNECTED call, validated payload
  const relay = (callId, event, payload) => {
    if (!isStr(callId)) return;
    const session = activeCalls.get(callId);
    if (!session || session.status !== "connected") return;
    const target = peerOf(session, socket.userId);
    if (!target) return; // sender is not a participant
    io.to(`user:${target}`).emit(event, { callId, ...payload });
  };

  // 1. INITIATE
  socket.on("call:initiate", async (data, callback) => {
    try {
      const targetUserId = asId(data?.targetUserId);
      const roomId = asId(data?.roomId);
      const callType = CALL_TYPES.has(data?.callType) ? data.callType : "video";

      if (!targetUserId || !roomId) {
        throw new ApiError(400, "targetUserId and roomId are required");
      }
      if (targetUserId === socket.userId) {
        throw new ApiError(400, "Cannot call yourself");
      }

      // Async checks first...
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
      const targetSockets = await io.in(`user:${targetUserId}`).fetchSockets();

      // ...then busy checks + session creation in the SAME tick (no race window)
      if (userCallMap.has(socket.userId)) {
        return callback?.({
          success: false,
          reason: "already-in-call",
          message: "You are already on an active call",
        });
      }
      if (userCallMap.has(targetUserId)) {
        return callback?.({
          success: false,
          reason: "busy",
          message: "The user is currently on another call",
        });
      }
      if (targetSockets.length === 0) {
        return callback?.({
          success: false,
          reason: "offline",
          message: "User is currently offline",
        });
      }

      const callId = crypto.randomUUID();
      const session = {
        callId,
        roomId,
        callerId: socket.userId,
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
      callback?.({ success: false, message: safeError(err) });
    }
  });

  // 2. CANCEL (caller, while ringing)
  socket.on("call:cancel", ({ callId } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.callerId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call not found" });
    }
    cleanupCallSession(callId);
    io.to(`user:${session.calleeId}`).emit("call:cancelled", { callId });
    callback?.({ success: true });
  });

  // 3. ACCEPT (callee)
  socket.on("call:accept", ({ callId } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.calleeId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call session not found" });
    }

    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    session.status = "connected";
    session.connectedAt = Date.now();

    socket
      .to(`user:${socket.userId}`)
      .emit("call:answered-elsewhere", { callId });
    io.to(`user:${session.callerId}`).emit("call:accepted", {
      callId,
      calleeId: socket.userId,
    });
    callback?.({ success: true });
  });

  // 4. REJECT (callee, while ringing)
  socket.on("call:reject", ({ callId, reason = "declined" } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.calleeId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call session not found" });
    }
    cleanupCallSession(callId);

    io.to(`user:${session.callerId}`).emit("call:rejected", {
      callId,
      reason: reason === "busy" ? "busy" : "declined",
    });
    socket.to(`user:${socket.userId}`).emit("call:cancelled", { callId });
    callback?.({ success: true });
  });

  // 5-7. SDP / ICE relay
  socket.on("call:sdp-offer", ({ callId, sdp } = {}) => {
    if (sdp?.type !== "offer" || !isStr(sdp.sdp, MAX_SDP_LENGTH)) return;
    relay(callId, "call:sdp-offer", { sdp: { type: "offer", sdp: sdp.sdp } });
  });

  socket.on("call:sdp-answer", ({ callId, sdp } = {}) => {
    if (sdp?.type !== "answer" || !isStr(sdp.sdp, MAX_SDP_LENGTH)) return;
    relay(callId, "call:sdp-answer", { sdp: { type: "answer", sdp: sdp.sdp } });
  });

  socket.on("call:ice-candidate", ({ callId, candidate } = {}) => {
    if (!candidate || typeof candidate !== "object") return;
    if (
      typeof candidate.candidate !== "string" ||
      candidate.candidate.length > 2000
    )
      return;
    relay(callId, "call:ice-candidate", { candidate });
  });

  // 8. MEDIA TOGGLE
  socket.on("call:media-toggle", ({ callId, kind, enabled } = {}) => {
    if (!MEDIA_KINDS.has(kind) || typeof enabled !== "boolean") return;
    relay(callId, "call:media-toggle", { kind, enabled });
  });

  // 9. END (either participant)
  socket.on("call:end", ({ callId } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (!session) return callback?.({ success: true });

    const target = peerOf(session, socket.userId);
    if (!target)
      return callback?.({ success: false, message: "Call not found" });

    const durationSec = session.connectedAt
      ? Math.floor((Date.now() - session.connectedAt) / 1000)
      : 0;

    cleanupCallSession(callId);
    io.to(`user:${target}`).emit("call:ended", {
      callId,
      duration: durationSec,
    });
    callback?.({ success: true, duration: durationSec });
  });

  // 10. DISCONNECT (with grace period for reconnects)
  socket.on("disconnect", () => {
    const callId = userCallMap.get(socket.userId);
    if (!callId) return;
    const initial = activeCalls.get(callId);
    if (!initial) return;

    const delay = initial.status === "connected" ? DISCONNECT_GRACE_MS : 0;

    setTimeout(async () => {
      try {
        const session = activeCalls.get(callId);
        if (!session) return; // already ended

        const remaining = await io.in(`user:${socket.userId}`).fetchSockets();
        if (remaining.length > 0) return; // user is back (reconnect / other tab)

        const durationSec = session.connectedAt
          ? Math.floor((Date.now() - session.connectedAt) / 1000)
          : 0;
        const wasRingingCaller =
          session.status === "ringing" && session.callerId === socket.userId;
        const other = peerOf(session, socket.userId);

        cleanupCallSession(callId);

        if (!other) return;
        if (wasRingingCaller) {
          io.to(`user:${other}`).emit("call:cancelled", { callId });
        } else {
          io.to(`user:${other}`).emit("call:peer-disconnected", {
            callId,
            duration: durationSec,
          });
        }
      } catch (err) {
        console.error("[call] disconnect cleanup error:", err);
      }
    }, delay);
  });
}

export default registerCallHandlers;
