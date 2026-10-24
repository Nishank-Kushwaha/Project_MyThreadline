import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { toast } from "sonner";
import { useSocket } from "./SocketContext";
import { useAuth } from "./AuthContext";
import { useMediaDevices } from "@/features/videoCall/hooks/useMediaDevices";
import { useWebRTC } from "@/features/videoCall/hooks/useWebRTC";
import { useCallSound } from "@/features/videoCall/hooks/useCallSound";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const socket = useSocket();
  const { user: currentUser } = useAuth();

  // Call state machine: "idle" | "calling" | "incoming" | "connected"
  const [callStatus, setCallStatus] = useState("idle");
  const [callId, setCallId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [callType, setCallType] = useState("video"); // "video" | "audio"
  const [peer, setPeer] = useState(null); // { _id, name, avatarUrl }
  const [isCaller, setIsCaller] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peerMediaState, setPeerMediaState] = useState({
    isAudioMuted: false,
    isVideoDisabled: false,
  });

  const durationTimerRef = useRef(null);
  const callStateRef = useRef({ callStatus: "idle", callId: null });

  // Sound effects
  const {
    startOutgoingRingback,
    startIncomingRingtone,
    playCallEndTone,
    stopSound,
  } = useCallSound();

  // Hardware devices
  const mediaDevices = useMediaDevices();
  const {
    localStream,
    getLocalStream,
    isAudioMuted,
    isVideoDisabled,
    isScreenSharing,
    acquireLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    stopAllMedia,
  } = mediaDevices;

  // WebRTC engine
  const handlePeerMediaToggle = useCallback(({ kind, enabled }) => {
    setPeerMediaState((prev) => ({
      ...prev,
      [kind === "audio" ? "isAudioMuted" : "isVideoDisabled"]: !enabled,
    }));
  }, []);

  const handleConnectionStateChange = useCallback((state) => {
    if (state === "failed") {
      toast.error("Call connection failed. Please check network/firewall.");
    }
  }, []);

  const webrtc = useWebRTC({
    socket,
    onPeerMediaToggle: handlePeerMediaToggle,
    onConnectionStateChange: handleConnectionStateChange,
  });

  const {
    remoteStream,
    createOffer,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
    closeConnection,
  } = webrtc;

  // Keep ref updated for event handlers
  useEffect(() => {
    callStateRef.current = { callStatus, callId };
  }, [callStatus, callId]);

  // Duration Timer
  useEffect(() => {
    if (callStatus === "connected") {
      setDuration(0);
      durationTimerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [callStatus]);

  // Teardown call state cleanly
  const resetCallState = useCallback(() => {
    stopSound();
    closeConnection();
    stopAllMedia();

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    setCallStatus("idle");
    setCallId(null);
    setRoomId(null);
    setPeer(null);
    setIsCaller(false);
    setDuration(0);
    setIsMinimized(false);
    setPeerMediaState({ isAudioMuted: false, isVideoDisabled: false });
  }, [closeConnection, stopAllMedia, stopSound]);

  // ==========================================
  // CALL ACTIONS
  // ==========================================

  // 1. Initiate Outgoing Call
  const initiateCall = useCallback(
    async ({ targetUserId, roomId: targetRoomId, peerUser, callType: requestedType = "video" }) => {
      if (!socket) {
        toast.error("Cannot make calls while disconnected.");
        return;
      }

      if (callStatus !== "idle") {
        toast.error("You are already in an active call.");
        return;
      }

      try {
        // 1. Acquire local camera/mic
        const stream = await acquireLocalStream({
          video: requestedType === "video",
          audio: true,
        });

        // 2. Set optimistic calling state
        setCallStatus("calling");
        setRoomId(targetRoomId);
        setCallType(requestedType);
        setPeer(peerUser);
        setIsCaller(true);
        startOutgoingRingback();

        // 3. Emit signaling event
        socket.emit(
          "call:initiate",
          {
            targetUserId,
            roomId: targetRoomId,
            callType: requestedType,
          },
          (res) => {
            if (!res?.success) {
              resetCallState();
              if (res?.reason === "busy") {
                toast.error(`${peerUser?.name || "User"} is busy on another call.`);
              } else if (res?.reason === "offline") {
                toast.error(`${peerUser?.name || "User"} is currently offline.`);
              } else {
                toast.error(res?.message || "Could not initiate call.");
              }
              return;
            }

            setCallId(res.callId);
          },
        );
      } catch (err) {
        resetCallState();
        toast.error(err.message || "Could not access camera/microphone.");
      }
    },
    [acquireLocalStream, callStatus, resetCallState, socket, startOutgoingRingback],
  );

  // 2. Accept Incoming Call
  const acceptCall = useCallback(async () => {
    if (!socket || !callId) return;

    try {
      stopSound();

      // Acquire media tracks matching call type
      const stream = await acquireLocalStream({
        video: callType === "video",
        audio: true,
      });

      socket.emit("call:accept", { callId }, (res) => {
        if (!res?.success) {
          resetCallState();
          toast.error(res?.message || "Could not accept call.");
          return;
        }

        setCallStatus("connected");
      });
    } catch (err) {
      resetCallState();
      toast.error(err.message || "Could not access camera or microphone.");
    }
  }, [acquireLocalStream, callId, callType, resetCallState, socket, stopSound]);

  // 3. Reject / Decline Incoming Call
  const rejectCall = useCallback(
    (reason = "declined") => {
      if (!socket || !callId) return;

      socket.emit("call:reject", { callId, reason });
      resetCallState();
    },
    [callId, resetCallState, socket],
  );

  // 4. Cancel Outgoing Call (Caller hangs up while ringing)
  const cancelCall = useCallback(() => {
    if (!socket || !callId) {
      resetCallState();
      return;
    }

    socket.emit("call:cancel", { callId });
    resetCallState();
  }, [callId, resetCallState, socket]);

  // 5. End Active Call (Either peer hangs up during call)
  const endCall = useCallback(() => {
    if (!socket || !callId) {
      resetCallState();
      return;
    }

    socket.emit("call:end", { callId });
    playCallEndTone();
    resetCallState();
  }, [callId, playCallEndTone, resetCallState, socket]);

  // In-call media toggles
  const handleToggleMic = useCallback(() => {
    const active = toggleAudio();
    if (socket && callId) {
      socket.emit("call:media-toggle", {
        callId,
        kind: "audio",
        enabled: active,
      });
    }
  }, [callId, socket, toggleAudio]);

  const handleToggleCamera = useCallback(() => {
    const active = toggleVideo();
    if (socket && callId) {
      socket.emit("call:media-toggle", {
        callId,
        kind: "video",
        enabled: active,
      });
    }
  }, [callId, socket, toggleVideo]);

  const handleToggleScreenShare = useCallback(async () => {
    const notifyPeer = (kind, enabled) => {
      if (socket && callId) {
        socket.emit("call:media-toggle", { callId, kind, enabled });
      }
    };

    if (isScreenSharing) {
      await stopScreenShare(webrtc.replaceVideoTrack, notifyPeer);
    } else {
      try {
        await startScreenShare(webrtc.replaceVideoTrack, notifyPeer);
      } catch (err) {
        if (err.name !== "NotAllowedError") {
          toast.error(err.message || "Screen sharing failed.");
        }
      }
    }
  }, [callId, isScreenSharing, socket, startScreenShare, stopScreenShare, webrtc.replaceVideoTrack]);

  // ==========================================
  // SOCKET SIGNALING LISTENERS
  // ==========================================
  useEffect(() => {
    if (!socket) return;

    // A) INCOMING CALL
    const onIncomingCall = ({ callId: incomingId, roomId: incomingRoomId, caller, callType: incomingType }) => {
      // If already in another call, automatically reject as busy
      if (callStateRef.current.callStatus !== "idle") {
        socket.emit("call:reject", { callId: incomingId, reason: "busy" });
        return;
      }

      setCallStatus("incoming");
      setCallId(incomingId);
      setRoomId(incomingRoomId);
      setCallType(incomingType);
      setPeer(caller);
      setIsCaller(false);
      startIncomingRingtone();
    };

    // B) CALL ACCEPTED (Caller receives accept from callee)
    const onCallAccepted = async ({ callId: acceptedId }) => {
      stopSound();
      setCallStatus("connected");

      // Offerer creates and dispatches SDP Offer
      try {
        const stream = getLocalStream() || localStream;
        await createOffer(acceptedId, stream);
      } catch (err) {
        console.error("[call] createOffer failed:", err);
        endCall();
      }
    };

    // C) CALL REJECTED
    const onCallRejected = ({ reason }) => {
      playCallEndTone();
      resetCallState();
      toast.info(reason === "busy" ? "User is busy on another call." : "Call declined.");
    };

    // D) CALL TIMEOUT (Unanswered after 30s)
    const onCallTimeout = () => {
      playCallEndTone();
      resetCallState();
      toast.info("No answer.");
    };

    // E) CALL CANCELLED (Caller hung up before answer, or callee answered on another tab)
    const onCallCancelled = () => {
      resetCallState();
    };

    const onAnsweredElsewhere = () => {
      resetCallState();
    };

    // F) SDP OFFER RECEIVED (Callee receives offer from caller)
    const onSdpOffer = async ({ callId: offerCallId, sdp }) => {
      try {
        const stream = getLocalStream() || localStream;
        await handleOfferAndAnswer(offerCallId, sdp, stream);
      } catch (err) {
        console.error("[call] handleOfferAndAnswer failed:", err);
      }
    };

    // G) SDP ANSWER RECEIVED (Caller receives answer from callee)
    const onSdpAnswer = async ({ sdp }) => {
      try {
        await handleAnswer(sdp);
      } catch (err) {
        console.error("[call] handleAnswer failed:", err);
      }
    };

    // H) REMOTE ICE CANDIDATE
    const onIceCandidate = async ({ candidate }) => {
      if (candidate) {
        await handleRemoteIceCandidate(candidate);
      }
    };

    // I) CALL ENDED BY PEER
    const onCallEnded = ({ duration: callDur }) => {
      playCallEndTone();
      resetCallState();
      const mins = Math.floor((callDur || 0) / 60);
      const secs = (callDur || 0) % 60;
      const formatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      toast.info(`Call ended (${formatted})`);
    };

    const onPeerDisconnected = () => {
      playCallEndTone();
      resetCallState();
      toast.warning("The other participant disconnected.");
    };

    // J) PEER MEDIA STATE TOGGLE (mute / camera off / screen share)
    const onPeerMediaToggle = ({ kind, enabled }) => {
      setPeerMediaState((prev) => ({
        ...prev,
        [kind === "audio" ? "isAudioMuted" : "isVideoDisabled"]: !enabled,
      }));
    };

    socket.on("call:incoming", onIncomingCall);
    socket.on("call:accepted", onCallAccepted);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:timeout", onCallTimeout);
    socket.on("call:cancelled", onCallCancelled);
    socket.on("call:answered-elsewhere", onAnsweredElsewhere);
    socket.on("call:sdp-offer", onSdpOffer);
    socket.on("call:sdp-answer", onSdpAnswer);
    socket.on("call:ice-candidate", onIceCandidate);
    socket.on("call:media-toggle", onPeerMediaToggle);
    socket.on("call:ended", onCallEnded);
    socket.on("call:peer-disconnected", onPeerDisconnected);

    return () => {
      socket.off("call:incoming", onIncomingCall);
      socket.off("call:accepted", onCallAccepted);
      socket.off("call:rejected", onCallRejected);
      socket.off("call:timeout", onCallTimeout);
      socket.off("call:cancelled", onCallCancelled);
      socket.off("call:answered-elsewhere", onAnsweredElsewhere);
      socket.off("call:sdp-offer", onSdpOffer);
      socket.off("call:sdp-answer", onSdpAnswer);
      socket.off("call:ice-candidate", onIceCandidate);
      socket.off("call:media-toggle", onPeerMediaToggle);
      socket.off("call:ended", onCallEnded);
      socket.off("call:peer-disconnected", onPeerDisconnected);
    };
  }, [
    socket,
    startIncomingRingtone,
    stopSound,
    playCallEndTone,
    resetCallState,
    createOffer,
    localStream,
    endCall,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
  ]);

  const value = {
    callStatus,
    callId,
    roomId,
    callType,
    peer,
    isCaller,
    duration,
    isMinimized,
    setIsMinimized,
    peerMediaState,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoDisabled,
    isScreenSharing,
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMic: handleToggleMic,
    toggleCamera: handleToggleCamera,
    toggleScreenShare: handleToggleScreenShare,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
