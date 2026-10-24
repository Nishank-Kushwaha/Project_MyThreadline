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

export function useWebRTC({ socket, onPeerMediaToggle, onConnectionStateChange }) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceConnectionState, setIceConnectionState] = useState("new");

  const pcRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const activeCallIdRef = useRef(null);

  // Flush queued ICE candidates after remote description is active
  const drainIceCandidateQueue = useCallback(async (pc) => {
    if (!pc || !pc.remoteDescription) return;

    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[webrtc] error adding buffered ICE candidate:", err);
      }
    }
  }, []);

  // Initialize RTCPeerConnection
  const initPeerConnection = useCallback(
    (callId, localStream, iceServers, isOfferer = false) => {
      activeCallIdRef.current = callId;
      iceCandidateQueueRef.current = [];

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        iceCandidatePoolSize: 2,
      });

      pcRef.current = pc;

      // 1. Attach local tracks to the connection
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // 2. Remote track received (accumulates all received tracks without discarding existing ones)
      pc.ontrack = (event) => {
        const track = event.track;
        if (!track) return;

        track.onmute = () => {
          if (track.kind === "video") {
            onPeerMediaToggle?.({ kind: "video", enabled: false });
          }
        };
        track.onunmute = () => {
          if (track.kind === "video") {
            onPeerMediaToggle?.({ kind: "video", enabled: true });
          }
        };

        setRemoteStream((prevStream) => {
          const currentTracks = prevStream ? prevStream.getTracks() : [];
          // Keep all existing tracks except replacing any with identical track id
          const filtered = currentTracks.filter((t) => t.id !== track.id);
          return new MediaStream([...filtered, track]);
        });
      };

      // 3. ICE candidate generated locally -> send to peer via signaling
      pc.onicecandidate = (event) => {
        if (event.candidate && activeCallIdRef.current) {
          socket?.emit("call:ice-candidate", {
            callId: activeCallIdRef.current,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // 4. Connection State changes
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnectionState(state);
        onConnectionStateChange?.(state);
      };

      // 5. ICE Connection State changes (handles reconnects / ICE restart)
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        setIceConnectionState(state);

        // Network switched (e.g. Wi-Fi -> Mobile Data)
        if (state === "disconnected" && isOfferer) {
          console.log("[webrtc] ICE connection disconnected, restarting ICE...");
          restartIce();
        }
      };

      return pc;
    },
    [socket, onConnectionStateChange],
  );

  // Offerer creates and sends initial SDP Offer (fetches fresh ICE servers when call starts)
  const createOffer = useCallback(async (callId, localStream) => {
    const iceServers = await getFreshIceServers();
    const pc = initPeerConnection(callId, localStream, iceServers, true);

    try {
      // Ensure audio and video transceivers are set to sendrecv
      const audioTransceiver = pc.getTransceivers().find(
        (t) => t.receiver?.track?.kind === "audio" || t.sender?.track?.kind === "audio",
      );
      if (audioTransceiver) {
        audioTransceiver.direction = "sendrecv";
      }

      const videoTransceiver = pc.getTransceivers().find(
        (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video",
      );
      if (videoTransceiver) {
        videoTransceiver.direction = "sendrecv";
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);

      socket?.emit("call:sdp-offer", {
        callId,
        sdp: pc.localDescription,
      });

      return offer;
    } catch (err) {
      console.error("[webrtc] createOffer error:", err);
      throw err;
    }
  }, [initPeerConnection, socket]);

  // Answerer receives SDP Offer and returns SDP Answer (fetches fresh ICE servers when call is accepted)
  const handleOfferAndAnswer = useCallback(
    async (callId, sdpOffer, localStream) => {
      const iceServers = await getFreshIceServers();
      const pc = initPeerConnection(callId, localStream, iceServers, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));

        // Drain any ICE candidates that arrived before offer was set
        await drainIceCandidateQueue(pc);

        // Ensure audio and video transceivers are set to sendrecv so answerer can send audio/video at any time
        const audioTransceiver = pc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === "audio" || t.sender?.track?.kind === "audio",
        );
        if (audioTransceiver) {
          audioTransceiver.direction = "sendrecv";
        }

        const videoTransceiver = pc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video",
        );
        if (videoTransceiver) {
          videoTransceiver.direction = "sendrecv";
        }

        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(answer);

        socket?.emit("call:sdp-answer", {
          callId,
          sdp: pc.localDescription,
        });

        return answer;
      } catch (err) {
        console.error("[webrtc] handleOfferAndAnswer error:", err);
        throw err;
      }
    },
    [initPeerConnection, drainIceCandidateQueue, socket],
  );

  // Offerer receives remote SDP Answer
  const handleAnswer = useCallback(
    async (sdpAnswer) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdpAnswer));
        await drainIceCandidateQueue(pc);
      } catch (err) {
        console.error("[webrtc] handleAnswer error:", err);
      }
    },
    [drainIceCandidateQueue],
  );

  // Handle incoming remote ICE candidates (with queue buffering)
  const handleRemoteIceCandidate = useCallback(
    async (candidate) => {
      const pc = pcRef.current;

      // If remote description isn't set yet, buffer the candidate to avoid race condition
      if (!pc || !pc.remoteDescription) {
        iceCandidateQueueRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[webrtc] addIceCandidate error:", err);
      }
    },
    [],
  );

  // Trigger ICE restart on network handoff (e.g. Wi-Fi to cellular)
  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !activeCallIdRef.current) return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      socket?.emit("call:sdp-offer", {
        callId: activeCallIdRef.current,
        sdp: pc.localDescription,
      });
    } catch (err) {
      console.warn("[webrtc] restartIce error:", err);
    }
  }, [socket]);

  // Replace video track on active peer connection (works for webcam -> screen share and vice versa)
  const replaceVideoTrack = useCallback(async (newTrack) => {
    const pc = pcRef.current;
    if (!pc) {
      console.warn("[webrtc] replaceVideoTrack called with no active peer connection");
      return;
    }

    // 1. Locate the video transceiver
    const videoTransceiver = pc.getTransceivers().find(
      (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video",
    );

    if (videoTransceiver) {
      if (videoTransceiver.direction !== "sendrecv") {
        videoTransceiver.direction = "sendrecv";
      }
      await videoTransceiver.sender.replaceTrack(newTrack);
    } else {
      // 2. Fallback to senders
      const senders = pc.getSenders();
      const videoSender = senders.find(
        (s) => (s.track && s.track.kind === "video") || (!s.track && s.dtlsTransport),
      );

      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
      } else if (newTrack) {
        pc.addTrack(newTrack);
      }
    }
  }, []);

  // Clean teardown
  const closeConnection = useCallback(() => {
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

  useEffect(() => {
    return () => {
      closeConnection();
    };
  }, [closeConnection]);

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
