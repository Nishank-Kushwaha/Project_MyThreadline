import crypto from "crypto";
import Room from "../../models/Room.js";
import ApiError from "../../utils/ApiError.js";

/**
 * CALL SIGNALING
 *
 * Design rules
 *  1. A call belongs to ONE specific tab per participant (the "bound socket"),
 *     not to "any socket of that user". Another device that merely shares the
 *     account can neither keep a call alive, receive its signaling, nor end it.
 *  2. If the bound socket drops, the participant becomes "offline" and gets a
 *     grace period. Only a client that presents the participant's secret resume
 *     token (issued when the call was created / accepted) can take the call
 *     back. A new tab or device cannot, because it does not have the token.
 *  3. "accepted" is not "connected". The call only counts as connected once a
 *     client reports that WebRTC media is up. If that never happens the call is
 *     ended automatically.
 *  4. Nothing can leak: every timer is owned by the session, cleanup is
 *     idempotent, and a periodic sweeper removes anything that is somehow stale.
 *
 * NOTE: state lives in memory => single server instance. For several instances
 * use sticky sessions + the socket.io Redis adapter and move these maps to Redis.
 */

const num = (v, fallback) =>
  Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback;

const RING_TIMEOUT_MS = num(process.env.CALL_RING_TIMEOUT_MS, 30_000);
const RECONNECT_GRACE_MS = num(process.env.CALL_RECONNECT_GRACE_MS, 10_000);
const MEDIA_SETUP_TIMEOUT_MS = num(
  process.env.CALL_MEDIA_SETUP_TIMEOUT_MS,
  45_000,
);
const MAX_CALL_MS = num(process.env.CALL_MAX_DURATION_MS, 6 * 60 * 60 * 1000);
const SWEEP_INTERVAL_MS = num(process.env.CALL_SWEEP_INTERVAL_MS, 60_000);

const MAX_SDP_LENGTH = 100_000;
const CALL_TYPES = new Set(["audio", "video"]);
const MEDIA_KINDS = new Set(["audio", "video", "screen"]);

// callId -> session
// session = {
//   callId, roomId, callerId, calleeId, callType,
//   status: "ringing" | "active",          // "active" = accepted (media may still be connecting)
//   createdAt, acceptedAt, mediaConnectedAt,
//   ringTimer, mediaTimer,
//   parties: { [userId]: { socketId, token, online, offlineSince, graceTimer } }
// }
const activeCalls = new Map();
// userId -> callId (a user can only be in one call at a time)
const userCallMap = new Map();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const asId = (v) => (v === undefined || v === null ? "" : String(v));
const isStr = (v, max = 200) =>
  typeof v === "string" && v.length > 0 && v.length <= max;

const newParty = (socketId = null) => ({
  socketId,
  token: socketId ? crypto.randomBytes(24).toString("hex") : null,
  online: Boolean(socketId),
  offlineSince: null,
  graceTimer: null,
});

function tokenMatches(expected, given) {
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function peerOf(session, userId) {
  if (session.callerId === userId) return session.calleeId;
  if (session.calleeId === userId) return session.callerId;
  return null;
}

function durationOf(session) {
  // Only real, connected media time counts (not ringing / setup time)
  return session.mediaConnectedAt
    ? Math.floor((Date.now() - session.mediaConnectedAt) / 1000)
    : 0;
}

const emitToUser = (io, userId, event, payload) =>
  io.to(`user:${userId}`).emit(event, payload);

function safeError(err) {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

/** Idempotent: safe to call from any timer/event, returns null if already gone. */
function cleanupCallSession(callId) {
  const session = activeCalls.get(callId);
  if (!session) return null;

  clearTimeout(session.ringTimer);
  clearTimeout(session.mediaTimer);
  Object.values(session.parties).forEach((p) => clearTimeout(p.graceTimer));

  if (userCallMap.get(session.callerId) === callId)
    userCallMap.delete(session.callerId);
  if (userCallMap.get(session.calleeId) === callId)
    userCallMap.delete(session.calleeId);
  activeCalls.delete(callId);
  return session;
}

/** End a call for BOTH users with a reason (used by watchdogs / sweeper). */
function terminateForBoth(io, callId, reason) {
  const session = cleanupCallSession(callId);
  if (!session) return;
  console.warn(`[call] ${callId} terminated: ${reason}`);
  const payload = { callId, duration: durationOf(session), reason };
  emitToUser(io, session.callerId, "call:ended", payload);
  emitToUser(io, session.calleeId, "call:ended", payload);
}

function handleRingTimeout(io, callId) {
  const session = activeCalls.get(callId);
  if (!session || session.status !== "ringing") return;
  cleanupCallSession(callId);
  console.log(`[call] ${callId} unanswered after ${RING_TIMEOUT_MS / 1000}s`);
  emitToUser(io, session.callerId, "call:timeout", {
    callId,
    reason: "no-answer",
  });
  emitToUser(io, session.calleeId, "call:cancelled", {
    callId,
    reason: "missed",
  });
}

function handleMediaTimeout(io, callId) {
  const session = activeCalls.get(callId);
  if (!session || session.status !== "active" || session.mediaConnectedAt)
    return;
  terminateForBoth(io, callId, "media-failed");
}

/** The bound socket of `userId` is gone: start the reconnect grace period. */
function markOffline(io, session, userId) {
  const party = session.parties[userId];
  if (!party || !party.online) return;

  party.online = false;
  party.offlineSince = Date.now();
  clearTimeout(party.graceTimer);
  party.graceTimer = setTimeout(
    () => endAfterGrace(io, session.callId, userId),
    RECONNECT_GRACE_MS,
  );

  const peerId = peerOf(session, userId);
  if (peerId) {
    emitToUser(io, peerId, "call:peer-reconnecting", {
      callId: session.callId,
      graceMs: RECONNECT_GRACE_MS,
    });
  }
}

function endAfterGrace(io, callId, userId) {
  const session = activeCalls.get(callId);
  if (!session) return;

  const party = session.parties[userId];
  if (!party || party.online) return; // they came back in time

  const duration = durationOf(session);
  const peerId = peerOf(session, userId);
  cleanupCallSession(callId);
  console.log(
    `[call] ${callId} ended: ${userId} did not return within grace period`,
  );
  if (peerId)
    emitToUser(io, peerId, "call:peer-disconnected", { callId, duration });
}

let sweeperStarted = false;
function startSweeper(io) {
  if (sweeperStarted) return;
  sweeperStarted = true;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const session of [...activeCalls.values()]) {
      const age = now - session.createdAt;
      if (session.status === "ringing" && age > RING_TIMEOUT_MS + 15_000) {
        terminateForBoth(io, session.callId, "stale-ringing");
      } else if (age > MAX_CALL_MS) {
        terminateForBoth(io, session.callId, "max-duration");
      }
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------
function registerCallHandlers(io, socket) {
  startSweeper(io);

  const myParty = (session) => session?.parties?.[socket.userId] ?? null;
  const isBoundSocket = (session) => myParty(session)?.socketId === socket.id;

  /**
   * Register a client event safely. A hostile or buggy client can send null,
   * strings, huge objects or a non-function "callback"; none of that may ever
   * throw out of a handler (an uncaught exception would crash the whole server).
   */
  const on = (event, handler) => {
    socket.on(event, (...args) => {
      const last = args[args.length - 1];
      const callback = typeof last === "function" ? last : undefined;
      const data = args[0] && typeof args[0] === "object" ? args[0] : {};
      const fail = (err) => {
        console.error(`[call] ${event} handler error:`, err);
        callback?.({ success: false, message: "Something went wrong" });
      };
      try {
        const result = handler(data, callback);
        if (result && typeof result.catch === "function") result.catch(fail);
      } catch (err) {
        fail(err);
      }
    });
  };

  /** Relay a signaling message to the peer's BOUND socket only. */
  const relay = (callId, event, payload) => {
    if (!isStr(callId)) return;
    const session = activeCalls.get(callId);
    if (!session || session.status !== "active" || !isBoundSocket(session))
      return;

    const peer = session.parties[peerOf(session, socket.userId)];
    // Peer offline: drop it. After they rejoin, the caller restarts ICE.
    if (!peer?.online || !peer.socketId) return;

    io.to(peer.socketId).emit(event, { callId, ...payload });
  };

  // 1. INITIATE -----------------------------------------------------------
  on("call:initiate", async (data, callback) => {
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

      // ...then busy checks + creation in the SAME tick (no race window)
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
      const callerParty = newParty(socket.id);
      const session = {
        callId,
        roomId,
        callerId: socket.userId,
        calleeId: targetUserId,
        callType,
        status: "ringing",
        createdAt: Date.now(),
        acceptedAt: null,
        mediaConnectedAt: null,
        ringTimer: setTimeout(
          () => handleRingTimeout(io, callId),
          RING_TIMEOUT_MS,
        ),
        mediaTimer: null,
        parties: {
          [socket.userId]: callerParty,
          [targetUserId]: newParty(null), // bound when the callee accepts
        },
      };

      activeCalls.set(callId, session);
      userCallMap.set(socket.userId, callId);
      userCallMap.set(targetUserId, callId);

      // Ring every device of the callee
      emitToUser(io, targetUserId, "call:incoming", {
        callId,
        roomId,
        caller: {
          _id: socket.userId,
          name: socket.userName || "User",
          avatarUrl: socket.userAvatarUrl || "",
        },
        callType,
      });

      callback?.({ success: true, callId, rejoinToken: callerParty.token });
    } catch (err) {
      callback?.({ success: false, message: safeError(err) });
    }
  });

  // 2. CANCEL (caller, while ringing) -----------------------------------------
  on("call:cancel", ({ callId } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.callerId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call not found" });
    }
    cleanupCallSession(callId);
    emitToUser(io, session.calleeId, "call:cancelled", { callId });
    callback?.({ success: true });
  });

  // 3. ACCEPT (callee) --------------------------------------------------------
  on("call:accept", ({ callId } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.calleeId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call session not found" });
    }

    clearTimeout(session.ringTimer);
    session.ringTimer = null;

    // The call is now bound to THIS tab of the callee
    const calleeParty = newParty(socket.id);
    session.parties[socket.userId] = calleeParty;
    session.status = "active";
    session.acceptedAt = Date.now();

    // Accepted is not connected: if media never comes up, end the call.
    session.mediaTimer = setTimeout(
      () => handleMediaTimeout(io, callId),
      MEDIA_SETUP_TIMEOUT_MS,
    );

    // Stop ringing on the callee's other devices
    socket
      .to(`user:${socket.userId}`)
      .emit("call:answered-elsewhere", { callId });

    const caller = session.parties[session.callerId];
    const callerTarget =
      caller?.online && caller.socketId
        ? caller.socketId
        : `user:${session.callerId}`;
    io.to(callerTarget).emit("call:accepted", {
      callId,
      calleeId: socket.userId,
    });

    callback?.({ success: true, rejoinToken: calleeParty.token });
  });

  // 4. REJECT (callee, while ringing) ------------------------------------------
  on("call:reject", ({ callId, reason = "declined" } = {}, callback) => {
    const session = activeCalls.get(callId);
    if (
      !session ||
      session.calleeId !== socket.userId ||
      session.status !== "ringing"
    ) {
      return callback?.({ success: false, message: "Call session not found" });
    }
    cleanupCallSession(callId);

    emitToUser(io, session.callerId, "call:rejected", {
      callId,
      reason: reason === "busy" ? "busy" : "declined",
    });
    socket.to(`user:${socket.userId}`).emit("call:cancelled", { callId });
    callback?.({ success: true });
  });

  // 5-7. SDP / ICE relay (bound sockets only) -----------------------------------
  on("call:sdp-offer", ({ callId, sdp } = {}) => {
    if (sdp?.type !== "offer" || !isStr(sdp.sdp, MAX_SDP_LENGTH)) return;
    relay(callId, "call:sdp-offer", { sdp: { type: "offer", sdp: sdp.sdp } });
  });

  on("call:sdp-answer", ({ callId, sdp } = {}) => {
    if (sdp?.type !== "answer" || !isStr(sdp.sdp, MAX_SDP_LENGTH)) return;
    relay(callId, "call:sdp-answer", { sdp: { type: "answer", sdp: sdp.sdp } });
  });

  on("call:ice-candidate", ({ callId, candidate } = {}) => {
    if (!candidate || typeof candidate !== "object") return;
    if (
      typeof candidate.candidate !== "string" ||
      candidate.candidate.length > 2000
    )
      return;
    relay(callId, "call:ice-candidate", { candidate });
  });

  // 8. MEDIA TOGGLE (mic / camera / screen share) --------------------------------
  on("call:media-toggle", ({ callId, kind, enabled } = {}) => {
    if (!MEDIA_KINDS.has(kind) || typeof enabled !== "boolean") return;
    relay(callId, "call:media-toggle", { kind, enabled });
  });

  // 9. MEDIA CONNECTED (client reports that WebRTC is really up) -----------------
  on("call:media-connected", ({ callId } = {}) => {
    const session = activeCalls.get(callId);
    if (!session || session.status !== "active" || !isBoundSocket(session))
      return;
    if (session.mediaConnectedAt) return;

    session.mediaConnectedAt = Date.now();
    clearTimeout(session.mediaTimer);
    session.mediaTimer = null;
  });

  // 10. REJOIN (same tab came back after its socket dropped) ----------------------
  on("call:rejoin", ({ callId, token } = {}, callback) => {
    const session = isStr(callId) ? activeCalls.get(callId) : null;
    const party = myParty(session);

    if (
      !session ||
      !party ||
      session.status !== "active" ||
      !tokenMatches(party.token, token)
    ) {
      return callback?.({ success: false, reason: "ended" });
    }

    clearTimeout(party.graceTimer);
    party.graceTimer = null;
    party.socketId = socket.id; // the call now follows this socket
    party.online = true;
    party.offlineSince = null;

    const peerId = peerOf(session, socket.userId);
    const peer = session.parties[peerId];
    emitToUser(io, peerId, "call:peer-reconnected", { callId });

    callback?.({ success: true, peerOnline: Boolean(peer?.online) });
  });

  // 11. END (either participant) ----------------------------------------------------
  on("call:end", ({ callId, token } = {}, callback) => {
    const session = isStr(callId) ? activeCalls.get(callId) : null;
    if (!session) return callback?.({ success: true });

    const party = myParty(session);
    const authorized =
      party &&
      (party.socketId === socket.id || tokenMatches(party.token, token));
    if (!authorized)
      return callback?.({ success: false, message: "Call not found" });

    const wasRinging = session.status === "ringing";
    const duration = durationOf(session);
    const peerId = peerOf(session, socket.userId);
    cleanupCallSession(callId);

    if (wasRinging) {
      emitToUser(io, peerId, "call:cancelled", { callId });
    } else {
      emitToUser(io, peerId, "call:ended", { callId, duration });
    }
    callback?.({ success: true, duration });
  });

  // 12. DISCONNECT ------------------------------------------------------------------
  socket.on("disconnect", async () => {
    try {
      const callId = userCallMap.get(socket.userId);
      if (!callId) return;
      const session = activeCalls.get(callId);
      if (!session) return;

      const userId = socket.userId;
      const party = session.parties[userId];

      if (session.status === "ringing") {
        if (userId === session.callerId) {
          // Caller's app dropped while ringing: cancel straight away
          if (party?.socketId !== socket.id) return;
          cleanupCallSession(callId);
          emitToUser(io, session.calleeId, "call:cancelled", { callId });
        } else {
          // Callee: only matters if NO device of theirs is left to answer
          const remaining = await io.in(`user:${userId}`).fetchSockets();
          const current = activeCalls.get(callId);
          if (remaining.length === 0 && current?.status === "ringing") {
            cleanupCallSession(callId);
            emitToUser(io, session.callerId, "call:timeout", {
              callId,
              reason: "offline",
            });
          }
        }
        return;
      }

      // Active call: only the BOUND socket matters. An idle second device
      // disconnecting (or staying connected) has no effect on the call.
      if (!party || party.socketId !== socket.id) return;
      markOffline(io, session, userId);
    } catch (err) {
      console.error("[call] disconnect handling error:", err);
    }
  });
}

export default registerCallHandlers;
