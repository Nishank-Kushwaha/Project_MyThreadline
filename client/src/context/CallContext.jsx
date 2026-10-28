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
import { useMediaDevices } from "@/features/videoCall/hooks/useMediaDevices";
import { useWebRTC } from "@/features/videoCall/hooks/useWebRTC";
import { useCallSound } from "@/features/videoCall/hooks/useCallSound";
import { RemoteAudio } from "@/features/videoCall/RemoteAudio";
import { useSpeakingDetector } from "@/features/videoCall/hooks/useSpeakingDetector";

const CallContext = createContext(null);

const FAILED_GRACE_MS = 8000;

export function CallProvider({ children }) {
  const socket = useSocket();

  // "idle" | "calling" | "incoming" | "connected"
  const [callStatus, setCallStatus] = useState("idle");
  const [callId, setCallId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [callType, setCallType] = useState("video");
  const [peer, setPeer] = useState(null);
  const [isCaller, setIsCaller] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peerMediaState, setPeerMediaState] = useState({
    isAudioMuted: false,
    isVideoDisabled: false,
    isScreenSharing: false,
  });

  // Source of truth for event handlers (updated synchronously, never stale)
  const callStateRef = useRef({
    callStatus: "idle",
    callId: null,
    callType: "video",
    isCaller: false,
  });
  // Secret issued by the server for THIS tab's side of the call. It is what lets
  // this tab (and no other device) take its call back after a socket reconnect.
  const rejoinTokenRef = useRef(null);
  const mediaReportedRef = useRef(false);
  const actionsRef = useRef({});
  const [peerReconnecting, setPeerReconnecting] = useState(false);
  const failTimerRef = useRef(null);

  const handlePeerMediaToggle = useCallback(({ kind, enabled }) => {
    setPeerMediaState((prev) => ({
      ...prev,
      [kind === "audio" ? "isAudioMuted" : "isVideoDisabled"]: !enabled,
    }));
  }, []);

  const handleConnectionStateChange = useCallback((state) => {
    if (state === "connected") {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
      toast.dismiss("call-net");
      actionsRef.current.reportMediaConnected?.(); // accepted != connected: tell the server it is real
    } else if (state === "disconnected") {
      toast.warning("Connection unstable, reconnecting…", { id: "call-net" });
    } else if (state === "failed") {
      toast.error("Connection lost. Trying to recover…", { id: "call-net" });
      // ICE restart is attempted by the WebRTC hook; give up if it does not recover
      if (!failTimerRef.current) {
        failTimerRef.current = setTimeout(() => {
          failTimerRef.current = null;
          toast.error("Call connection failed. Check your network/firewall.");
          actionsRef.current.endCall?.();
        }, FAILED_GRACE_MS);
      }
    }
  }, []);

  const {
    startOutgoingRingback,
    startIncomingRingtone,
    playCallEndTone,
    stopSound,
  } = useCallSound();

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
  } = useMediaDevices();

  const {
    remoteStream,
    connectionState,
    networkQuality,
    createOffer,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
    replaceVideoTrack,
    restartIce,
    closeConnection,
  } = useWebRTC({
    socket,
    onPeerMediaToggle: handlePeerMediaToggle,
    onConnectionStateChange: handleConnectionStateChange,
  });

  // Is the other person talking? (real loudness from their audio stream)
  const { isSpeaking: peerSpeaking, levelRef: peerLevelRef } =
    useSpeakingDetector(remoteStream);
  // ...and are you? (your own mic; a muted mic is silent, so it never lights up)
  const { isSpeaking: selfSpeaking, levelRef: selfLevelRef } =
    useSpeakingDetector(localStream);

  // Backup sync from state
  useEffect(() => {
    callStateRef.current = {
      ...callStateRef.current,
      callStatus,
      callId,
      callType,
    };
  }, [callStatus, callId, callType]);

  // Duration counts only while media is actually connected
  useEffect(() => {
    if (callStatus !== "connected" || connectionState !== "connected") return;
    const timer = setInterval(() => setDuration((p) => p + 1), 1000);
    return () => clearInterval(timer);
  }, [callStatus, connectionState]);

  const resetCallState = useCallback(() => {
    stopSound();
    closeConnection();
    stopAllMedia();
    clearTimeout(failTimerRef.current);
    failTimerRef.current = null;
    toast.dismiss("call-net");

    callStateRef.current = {
      callStatus: "idle",
      callId: null,
      callType: "video",
      isCaller: false,
    };
    rejoinTokenRef.current = null;
    mediaReportedRef.current = false;
    toast.dismiss("peer-net");
    toast.dismiss("socket-net");
    setPeerReconnecting(false);
    setCallStatus("idle");
    setCallId(null);
    setRoomId(null);
    setPeer(null);
    setIsCaller(false);
    setDuration(0);
    setIsMinimized(false);
    setPeerMediaState({
      isAudioMuted: false,
      isVideoDisabled: false,
      isScreenSharing: false,
    });
  }, [closeConnection, stopAllMedia, stopSound]);

  // ==========================================
  // CALL ACTIONS
  // ==========================================

  const initiateCall = useCallback(
    async ({
      targetUserId,
      roomId: targetRoomId,
      peerUser,
      callType: requestedType = "video",
    }) => {
      if (!socket) {
        toast.error("Cannot make calls while disconnected.");
        return;
      }
      if (callStateRef.current.callStatus !== "idle") {
        toast.error("You are already in an active call.");
        return;
      }

      // Claim the slot immediately so a double-click can't start two calls
      callStateRef.current = {
        callStatus: "calling",
        callId: null,
        callType: requestedType,
        isCaller: true,
      };

      try {
        await acquireLocalStream({
          video: requestedType === "video",
          audio: true,
        });

        // Cancelled/reset while the permission prompt was open
        if (callStateRef.current.callStatus !== "calling") {
          stopAllMedia();
          return;
        }

        setCallStatus("calling");
        setRoomId(targetRoomId);
        setCallType(requestedType);
        setPeer(peerUser);
        setIsCaller(true);
        startOutgoingRingback();

        socket.emit(
          "call:initiate",
          { targetUserId, roomId: targetRoomId, callType: requestedType },
          (res) => {
            if (!res?.success) {
              resetCallState();
              if (res?.reason === "busy") {
                toast.error(
                  `${peerUser?.name || "User"} is busy on another call.`,
                );
              } else if (res?.reason === "offline") {
                toast.error(
                  `${peerUser?.name || "User"} is currently offline.`,
                );
              } else {
                toast.error(res?.message || "Could not initiate call.");
              }
              return;
            }
            callStateRef.current.callId = res.callId;
            rejoinTokenRef.current = res.rejoinToken ?? null;
            setCallId(res.callId);
          },
        );
      } catch (err) {
        resetCallState();
        toast.error(err.message || "Could not access camera/microphone.");
      }
    },
    [
      acquireLocalStream,
      resetCallState,
      socket,
      startOutgoingRingback,
      stopAllMedia,
    ],
  );

  const acceptCall = useCallback(async () => {
    const {
      callStatus: status,
      callId: id,
      callType: type,
    } = callStateRef.current;
    if (!socket || !id || status !== "incoming") return;

    stopSound();
    try {
      await acquireLocalStream({ video: type === "video", audio: true });

      // Caller hung up while the permission prompt was open
      if (callStateRef.current.callId !== id) {
        stopAllMedia();
        return;
      }

      socket.emit("call:accept", { callId: id }, (res) => {
        if (!res?.success) {
          resetCallState();
          toast.error(res?.message || "Could not accept call.");
          return;
        }
        rejoinTokenRef.current = res.rejoinToken ?? null;
        callStateRef.current.callStatus = "connected";
        setCallStatus("connected");
      });
    } catch (err) {
      socket.emit("call:reject", { callId: id, reason: "declined" });
      resetCallState();
      toast.error(err.message || "Could not access camera or microphone.");
    }
  }, [acquireLocalStream, resetCallState, socket, stopAllMedia, stopSound]);

  const rejectCall = useCallback(
    (reason = "declined") => {
      const id = callStateRef.current.callId;
      if (socket && id) socket.emit("call:reject", { callId: id, reason });
      resetCallState();
    },
    [resetCallState, socket],
  );

  const cancelCall = useCallback(() => {
    const id = callStateRef.current.callId;
    if (socket && id) socket.emit("call:cancel", { callId: id });
    resetCallState();
  }, [resetCallState, socket]);

  const endCall = useCallback(() => {
    const id = callStateRef.current.callId;
    if (socket && id) {
      socket.emit("call:end", { callId: id, token: rejoinTokenRef.current });
      playCallEndTone();
    }
    resetCallState();
  }, [playCallEndTone, resetCallState, socket]);

  const notifyPeer = useCallback(
    (kind, enabled) => {
      const id = callStateRef.current.callId;
      if (socket && id)
        socket.emit("call:media-toggle", { callId: id, kind, enabled });
    },
    [socket],
  );

  const handleToggleMic = useCallback(() => {
    notifyPeer("audio", toggleAudio());
  }, [notifyPeer, toggleAudio]);

  const handleToggleCamera = useCallback(() => {
    notifyPeer("video", toggleVideo());
  }, [notifyPeer, toggleVideo]);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare(replaceVideoTrack, notifyPeer);
    } else {
      try {
        await startScreenShare(replaceVideoTrack, notifyPeer);
      } catch (err) {
        if (err.name !== "NotAllowedError") {
          toast.error(err.message || "Screen sharing failed.");
        }
      }
    }
  }, [
    isScreenSharing,
    notifyPeer,
    replaceVideoTrack,
    startScreenShare,
    stopScreenShare,
  ]);

  // Expose the latest functions to the (stable) socket listeners
  actionsRef.current = {
    resetCallState,
    endCall,
    createOffer,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
    getLocalStream,
    playCallEndTone,
    stopSound,
    startIncomingRingtone,
    // Only restart ICE when the media path is actually unhealthy
    restartIceIfNeeded: () => {
      if (connectionState !== "connected") restartIce();
    },
    reportMediaConnected: () => {
      const id = callStateRef.current.callId;
      if (!socket || !id || mediaReportedRef.current) return;
      mediaReportedRef.current = true;
      socket.emit("call:media-connected", { callId: id });
    },
    // After being offline the other side may have missed our mute/camera/screen state
    resyncMedia: () => {
      notifyPeer("audio", !isAudioMuted);
      notifyPeer("video", !isVideoDisabled);
      if (isScreenSharing) notifyPeer("screen", true);
    },
  };

  // Hang up if the tab is closed mid-call
  useEffect(() => {
    const onUnload = () => {
      const id = callStateRef.current.callId;
      if (socket && id)
        socket.emit("call:end", { callId: id, token: rejoinTokenRef.current });
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [socket]);

  // ==========================================
  // SOCKET SIGNALING LISTENERS (subscribed once per socket)
  // ==========================================
  useEffect(() => {
    if (!socket) return;

    const isCurrent = (id) => id && callStateRef.current.callId === id;

    const onIncomingCall = ({
      callId: id,
      roomId: rid,
      caller,
      callType: type,
    }) => {
      if (callStateRef.current.callStatus !== "idle") {
        socket.emit("call:reject", { callId: id, reason: "busy" });
        return;
      }
      callStateRef.current = {
        callStatus: "incoming",
        callId: id,
        callType: type,
        isCaller: false,
      };
      setCallStatus("incoming");
      setCallId(id);
      setRoomId(rid);
      setCallType(type);
      setPeer(caller);
      setIsCaller(false);
      actionsRef.current.startIncomingRingtone();
    };

    const onCallAccepted = async ({ callId: id }) => {
      if (!isCurrent(id)) return;
      const a = actionsRef.current;
      a.stopSound();
      callStateRef.current.callStatus = "connected";
      setCallStatus("connected");

      try {
        await a.createOffer(id, a.getLocalStream(), {
          video: callStateRef.current.callType === "video",
        });
      } catch (err) {
        console.error("[call] createOffer failed:", err);
        a.endCall();
      }
    };

    const onCallRejected = ({ callId: id, reason }) => {
      if (!isCurrent(id)) return;
      actionsRef.current.playCallEndTone();
      actionsRef.current.resetCallState();
      toast.info(
        reason === "busy" ? "User is busy on another call." : "Call declined.",
      );
    };

    const onCallTimeout = ({ callId: id, reason }) => {
      if (!isCurrent(id)) return;
      actionsRef.current.playCallEndTone();
      actionsRef.current.resetCallState();
      toast.info(
        reason === "offline" ? "They just went offline." : "No answer.",
      );
    };

    const onCallCancelled = ({ callId: id }) => {
      if (!isCurrent(id)) return;
      actionsRef.current.resetCallState();
    };

    const onSdpOffer = async ({ callId: id, sdp }) => {
      if (!isCurrent(id)) return;
      try {
        const a = actionsRef.current;
        await a.handleOfferAndAnswer(id, sdp, a.getLocalStream());
      } catch (err) {
        console.error("[call] handleOfferAndAnswer failed:", err);
      }
    };

    const onSdpAnswer = async ({ callId: id, sdp }) => {
      if (!isCurrent(id)) return;
      try {
        await actionsRef.current.handleAnswer(sdp);
      } catch (err) {
        console.error("[call] handleAnswer failed:", err);
      }
    };

    const onIceCandidate = async ({ callId: id, candidate }) => {
      if (!isCurrent(id) || !candidate) return;
      await actionsRef.current.handleRemoteIceCandidate(candidate);
    };

    const onCallEnded = ({ callId: id, duration: callDur, reason }) => {
      if (!isCurrent(id)) return;
      actionsRef.current.playCallEndTone();
      actionsRef.current.resetCallState();
      if (reason === "media-failed") {
        toast.error("Couldn't establish a connection. Please try again.");
        return;
      }
      if (reason === "max-duration") {
        toast.info("The call reached the maximum duration.");
        return;
      }
      const mins = Math.floor((callDur || 0) / 60);
      const secs = (callDur || 0) % 60;
      toast.info(`Call ended (${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`})`);
    };

    const onPeerDisconnected = ({ callId: id }) => {
      if (!isCurrent(id)) return;
      actionsRef.current.playCallEndTone();
      actionsRef.current.resetCallState();
      toast.warning("The other participant disconnected.");
    };

    const onPeerMediaToggleEvent = ({ callId: id, kind, enabled }) => {
      if (!isCurrent(id)) return;
      setPeerMediaState((prev) => {
        if (kind === "screen")
          return { ...prev, isScreenSharing: Boolean(enabled) };
        return {
          ...prev,
          [kind === "audio" ? "isAudioMuted" : "isVideoDisabled"]: !enabled,
        };
      });
    };

    // The other side lost its connection; the server is holding the call for them
    const onPeerReconnecting = ({ callId: id }) => {
      if (!isCurrent(id)) return;
      setPeerReconnecting(true);
    };

    const onPeerReconnected = ({ callId: id }) => {
      if (!isCurrent(id)) return;
      setPeerReconnecting(false);
      // The caller owns ICE restarts: bring the media path back if it did not recover itself
      if (callStateRef.current.isCaller)
        actionsRef.current.restartIceIfNeeded();
    };

    // OUR socket dropped and came back (new socket id): take our call back with the secret token
    const onSocketDisconnect = (reason) => {
      if (reason === "io client disconnect") return;
      if (callStateRef.current.callStatus === "connected") {
        toast.warning("Connection lost. Reconnecting…", { id: "socket-net" });
      }
    };

    const onSocketConnect = () => {
      const {
        callStatus: status,
        callId: id,
        isCaller: caller,
      } = callStateRef.current;

      // A call that was still RINGING when our connection dropped is gone on the
      // server (it cancels immediately). Don't leave this screen stuck on "Ringing…".
      if (status === "calling" || status === "incoming") {
        actionsRef.current.resetCallState();
        if (status === "calling")
          toast.info("Call cancelled because your connection dropped.");
        return;
      }

      if (status !== "connected" || !id) return; // only an accepted call can be resumed

      socket.emit(
        "call:rejoin",
        { callId: id, token: rejoinTokenRef.current },
        (res) => {
          if (!isCurrent(id)) return;
          if (!res?.success) {
            actionsRef.current.resetCallState();
            toast.info("The call ended while you were offline.");
            return;
          }
          toast.dismiss("socket-net");
          actionsRef.current.resyncMedia();
          if (caller) actionsRef.current.restartIceIfNeeded();
        },
      );
    };

    const handlers = {
      connect: onSocketConnect,
      disconnect: onSocketDisconnect,
      "call:peer-reconnecting": onPeerReconnecting,
      "call:peer-reconnected": onPeerReconnected,
      "call:incoming": onIncomingCall,
      "call:accepted": onCallAccepted,
      "call:rejected": onCallRejected,
      "call:timeout": onCallTimeout,
      "call:cancelled": onCallCancelled,
      "call:answered-elsewhere": onCallCancelled,
      "call:sdp-offer": onSdpOffer,
      "call:sdp-answer": onSdpAnswer,
      "call:ice-candidate": onIceCandidate,
      "call:media-toggle": onPeerMediaToggleEvent,
      "call:ended": onCallEnded,
      "call:peer-disconnected": onPeerDisconnected,
    };

    Object.entries(handlers).forEach(([evt, fn]) => socket.on(evt, fn));
    return () => {
      Object.entries(handlers).forEach(([evt, fn]) => socket.off(evt, fn));
    };
  }, [socket]);

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
    connectionState,
    networkQuality,
    peerSpeaking,
    peerLevelRef,
    selfSpeaking,
    selfLevelRef,
    peerReconnecting,
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

  return (
    <CallContext.Provider value={value}>
      {/* Single, always-mounted remote audio sink */}
      <RemoteAudio stream={remoteStream} />
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
