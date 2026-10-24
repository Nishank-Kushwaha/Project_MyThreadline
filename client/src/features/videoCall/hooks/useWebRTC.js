import { useState, useRef, useCallback, useEffect } from "react";
import { fetchIceServersRequest } from "@/api/callsApi";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// Helper to fetch dynamic ICE servers with authenticated session right when a call starts
async function getFreshIceServers() {
  try {
    const data = await fetchIceServersRequest();
    if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
      return data.iceServers;
    }
  } catch (err) {
    console.warn("[webrtc] using default STUN fallback:", err.message);
  }
  return DEFAULT_ICE_SERVERS;
}

function setSendRecv(pc) {
  pc.getTransceivers().forEach((t) => {
    if (t.direction !== "stopped" && !t.stopped) t.direction = "sendrecv";
  });
}

export function useWebRTC({
  socket,
  onPeerMediaToggle,
  onConnectionStateChange,
}) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceConnectionState, setIceConnectionState] = useState("new");

  const pcRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const activeCallIdRef = useRef(null);
  const isOffererRef = useRef(false);
  const setupIdRef = useRef(0); // guards against overlapping async setups
  const restartTimerRef = useRef(null);

  // Keep latest socket/callbacks in refs so handlers never go stale
  const socketRef = useRef(socket);
  const cbRef = useRef({ onPeerMediaToggle, onConnectionStateChange });
  useEffect(() => {
    socketRef.current = socket;
    cbRef.current = { onPeerMediaToggle, onConnectionStateChange };
  });

  const drainIceCandidateQueue = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("[webrtc] error adding buffered ICE candidate:", err);
      }
    }
  }, []);

  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !activeCallIdRef.current) return;

    // Only the offerer restarts, and only when no negotiation is in flight
    if (pc.signalingState !== "stable") {
      console.warn("[webrtc] skip ICE restart, state:", pc.signalingState);
      return;
    }

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      if (pc !== pcRef.current || pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("call:sdp-offer", {
        callId: activeCallIdRef.current,
        sdp: pc.localDescription,
      });
    } catch (err) {
      console.warn("[webrtc] restartIce error:", err);
    }
  }, []);

  const initPeerConnection = useCallback(
    (callId, localStream, iceServers, isOfferer) => {
      activeCallIdRef.current = callId;
      isOffererRef.current = isOfferer;
      // NOTE: do NOT clear the ICE queue here, candidates may already be buffered

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        iceCandidatePoolSize: 2,
      });
      pcRef.current = pc;

      localStream
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (pc !== pcRef.current) return;
        const track = event.track;
        if (!track) return;

        track.onmute = () => {
          if (track.kind === "video")
            cbRef.current.onPeerMediaToggle?.({
              kind: "video",
              enabled: false,
            });
        };
        track.onunmute = () => {
          if (track.kind === "video")
            cbRef.current.onPeerMediaToggle?.({ kind: "video", enabled: true });
        };

        setRemoteStream((prev) => {
          const existing = prev ? prev.getTracks() : [];
          const filtered = existing.filter((t) => t.id !== track.id);
          return new MediaStream([...filtered, track]);
        });
      };

      pc.onicecandidate = (event) => {
        if (pc !== pcRef.current) return;
        if (event.candidate && activeCallIdRef.current) {
          socketRef.current?.emit("call:ice-candidate", {
            callId: activeCallIdRef.current,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        setConnectionState(pc.connectionState);
        cbRef.current.onConnectionStateChange?.(pc.connectionState);
      };

      pc.oniceconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        const state = pc.iceConnectionState;
        setIceConnectionState(state);

        if (state === "connected" || state === "completed") {
          clearTimeout(restartTimerRef.current);
          restartTimerRef.current = null;
          return;
        }

        // Debounced: "disconnected" often recovers by itself
        if (
          (state === "disconnected" || state === "failed") &&
          isOffererRef.current &&
          !restartTimerRef.current
        ) {
          restartTimerRef.current = setTimeout(
            () => {
              restartTimerRef.current = null;
              if (
                pcRef.current === pc &&
                pc.iceConnectionState !== "connected" &&
                pc.iceConnectionState !== "completed"
              ) {
                console.log("[webrtc] restarting ICE...");
                restartIce();
              }
            },
            state === "failed" ? 0 : 3000,
          );
        }
      };

      return pc;
    },
    [restartIce],
  );

  const createOffer = useCallback(
    async (callId, localStream) => {
      const myId = ++setupIdRef.current;
      const iceServers = await getFreshIceServers();
      if (myId !== setupIdRef.current) return null; // superseded by a newer call/close

      const pc = initPeerConnection(callId, localStream, iceServers, true);
      try {
        setSendRecv(pc);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("call:sdp-offer", {
          callId,
          sdp: pc.localDescription,
        });
        return offer;
      } catch (err) {
        console.error("[webrtc] createOffer error:", err);
        throw err;
      }
    },
    [initPeerConnection],
  );

  const handleOfferAndAnswer = useCallback(
    async (callId, sdpOffer, localStream) => {
      let pc = pcRef.current;
      const isRenegotiation =
        pc &&
        activeCallIdRef.current === callId &&
        pc.connectionState !== "closed";

      // Fresh call -> build a new connection. Renegotiation (ICE restart) -> reuse it.
      if (!isRenegotiation) {
        const myId = ++setupIdRef.current;
        const iceServers = await getFreshIceServers();
        if (myId !== setupIdRef.current) return null;
        pc = initPeerConnection(callId, localStream, iceServers, false);
      }

      try {
        // Glare: we have our own pending offer, roll it back (answerer is "polite")
        if (pc.signalingState === "have-local-offer") {
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));
        await drainIceCandidateQueue(pc);

        setSendRecv(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.emit("call:sdp-answer", {
          callId,
          sdp: pc.localDescription,
        });
        return answer;
      } catch (err) {
        console.error("[webrtc] handleOfferAndAnswer error:", err);
        throw err;
      }
    },
    [initPeerConnection, drainIceCandidateQueue],
  );

  const handleAnswer = useCallback(
    async (sdpAnswer) => {
      const pc = pcRef.current;
      if (!pc) return;

      // The fix for your error: an answer is only valid in have-local-offer
      if (pc.signalingState !== "have-local-offer") {
        console.warn(
          "[webrtc] ignoring answer, signalingState =",
          pc.signalingState,
        );
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));
        await drainIceCandidateQueue(pc);
      } catch (err) {
        console.error("[webrtc] handleAnswer error:", err);
      }
    },
    [drainIceCandidateQueue],
  );

  const handleRemoteIceCandidate = useCallback(async (candidate) => {
    const pc = pcRef.current;
    if (!candidate) return;

    if (!pc || !pc.remoteDescription) {
      iceCandidateQueueRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[webrtc] addIceCandidate error:", err);
    }
  }, []);

  const replaceVideoTrack = useCallback(async (newTrack) => {
    const pc = pcRef.current;
    if (!pc) return;

    const videoTransceiver = pc
      .getTransceivers()
      .find(
        (t) =>
          t.receiver?.track?.kind === "video" ||
          t.sender?.track?.kind === "video",
      );

    if (videoTransceiver) {
      await videoTransceiver.sender.replaceTrack(newTrack);
    } else if (newTrack) {
      pc.addTrack(newTrack);
    }
  }, []);

  const closeConnection = useCallback(() => {
    setupIdRef.current++; // cancel any in-flight async setup
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    activeCallIdRef.current = null;
    iceCandidateQueueRef.current = [];

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setConnectionState("closed");
    setIceConnectionState("closed");
  }, []);

  useEffect(() => closeConnection, [closeConnection]);

  return {
    pc: pcRef.current,
    remoteStream,
    connectionState,
    iceConnectionState,
    createOffer,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
    restartIce,
    replaceVideoTrack,
    closeConnection,
  };
}
