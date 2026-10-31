import { useState, useRef, useCallback, useEffect } from "react";
import { fetchIceServersRequest } from "@/api/callsApi";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

const AUDIO_MAX_BITRATE = 32000; // plenty for wideband Opus voice

const QUALITY_PROFILES = {
  good: {
    camera: 1_500_000,
    screen: 2_500_000,
    camFps: 30,
    screenFps: 15,
    scale: 1,
  },
  fair: {
    camera: 800_000,
    screen: 1_200_000,
    camFps: 24,
    screenFps: 10,
    scale: 1.5,
  },
  poor: {
    camera: 300_000,
    screen: 500_000,
    camFps: 15,
    screenFps: 5,
    scale: 2,
  },
};
const QUALITY_ORDER = { good: 0, fair: 1, poor: 2 };

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

/** Tune Opus for voice: mono, in-band FEC, capped bitrate (also helps echo cancellation). */
function tuneOpus(sdp) {
  if (!sdp) return sdp;
  const rtpmap = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];

  const wanted = {
    minptime: "10",
    useinbandfec: "1",
    stereo: "0",
    "sprop-stereo": "0",
    maxaveragebitrate: String(AUDIO_MAX_BITRATE),
    cbr: "0",
  };

  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const existing = sdp.match(fmtpRe);

  if (existing) {
    const map = {};
    existing[1].split(";").forEach((kv) => {
      const [k, v] = kv.trim().split("=");
      if (k) map[k] = v;
    });
    Object.assign(map, wanted);
    const line = `a=fmtp:${pt} ${Object.entries(map)
      .map(([k, v]) => (v === undefined ? k : `${k}=${v}`))
      .join(";")}`;
    return sdp.replace(fmtpRe, line);
  }

  const line = `a=fmtp:${pt} ${Object.entries(wanted)
    .map(([k, v]) => `${k}=${v}`)
    .join(";")}`;
  return sdp.replace(
    new RegExp(`(a=rtpmap:${pt} opus/48000/2\\r?\\n)`, "i"),
    `$1${line}\r\n`,
  );
}

async function setLocalTuned(pc, desc) {
  await pc.setLocalDescription({ type: desc.type, sdp: tuneOpus(desc.sdp) });
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

function setSendRecv(pc) {
  pc.getTransceivers().forEach((t) => {
    if (t.currentDirection !== "stopped") t.direction = "sendrecv";
  });
}

/** Make sure an m-line exists for each media kind so tracks can be added later via replaceTrack. */
function ensureTransceivers(pc, { audio = true, video = false }) {
  const has = (kind) =>
    pc.getTransceivers().some((t) => t.receiver.track.kind === kind);
  if (audio && !has("audio"))
    pc.addTransceiver("audio", { direction: "sendrecv" });
  if (video && !has("video"))
    pc.addTransceiver("video", { direction: "sendrecv" });
}

async function applySenderQuality(pc, level = "good") {
  if (!pc || pc.connectionState === "closed") return;
  const profile = QUALITY_PROFILES[level];

  for (const sender of pc.getSenders()) {
    const track = sender.track;
    if (!track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0)
        params.encodings = [{}];
      const enc = params.encodings[0];

      if (track.kind === "audio") {
        enc.maxBitrate = AUDIO_MAX_BITRATE;
        enc.priority = "high";
        enc.networkPriority = "high";
      } else {
        const isScreen = track.contentHint === "detail";
        enc.maxBitrate = isScreen ? profile.screen : profile.camera;
        enc.maxFramerate = isScreen ? profile.screenFps : profile.camFps;
        enc.scaleResolutionDownBy = isScreen ? 1 : profile.scale;
        params.degradationPreference = isScreen
          ? "maintain-resolution"
          : "balanced";
      }
      await sender.setParameters(params);
    } catch (err) {
      console.warn("[webrtc] setParameters failed:", err.message);
    }
  }
}

export function useWebRTC({
  socket,
  onPeerMediaToggle,
  onConnectionStateChange,
}) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceConnectionState, setIceConnectionState] = useState("new");
  const [networkQuality, setNetworkQuality] = useState("good");

  const pcRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const activeCallIdRef = useRef(null);
  const isOffererRef = useRef(false);
  const setupIdRef = useRef(0);
  const restartTimerRef = useRef(null);
  const qualityRef = useRef("good");

  // Latest socket/callbacks without re-creating handlers
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
        console.warn("[webrtc] buffered ICE candidate error:", err.message);
      }
    }
  }, []);

  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !activeCallIdRef.current) return;
    if (pc.signalingState !== "stable") return; // negotiation already in flight

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      if (pc !== pcRef.current || pc.signalingState !== "stable") return;
      const sdp = await setLocalTuned(pc, offer);
      socketRef.current?.emit("call:sdp-offer", {
        callId: activeCallIdRef.current,
        sdp,
      });
    } catch (err) {
      console.warn("[webrtc] restartIce error:", err);
    }
  }, []);

  const initPeerConnection = useCallback(
    (callId, localStream, iceServers, isOfferer) => {
      activeCallIdRef.current = callId;
      isOffererRef.current = isOfferer;
      // Do NOT clear the ICE queue here: candidates may have arrived already.

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServers || DEFAULT_ICE_SERVERS,
        iceCandidatePoolSize: 2,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
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

        // "disconnected" often self-heals, so debounce; "failed" restarts right away.
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
    async (callId, localStream, { video = true } = {}) => {
      const myId = ++setupIdRef.current;
      const iceServers = await getFreshIceServers();
      if (myId !== setupIdRef.current) return null; // superseded or closed

      const pc = initPeerConnection(callId, localStream, iceServers, true);
      try {
        ensureTransceivers(pc, { audio: true, video });
        setSendRecv(pc);
        const offer = await pc.createOffer();
        const sdp = await setLocalTuned(pc, offer);
        socketRef.current?.emit("call:sdp-offer", { callId, sdp });
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

      if (!isRenegotiation) {
        const myId = ++setupIdRef.current;
        const iceServers = await getFreshIceServers();
        if (myId !== setupIdRef.current) return null;
        pc = initPeerConnection(callId, localStream, iceServers, false);
      }

      try {
        // Glare: answerer is the "polite" side and rolls back its own pending offer
        if (pc.signalingState === "have-local-offer") {
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdpOffer));
        await drainIceCandidateQueue(pc);

        setSendRecv(pc);
        const answer = await pc.createAnswer();
        const sdp = await setLocalTuned(pc, answer);

        socketRef.current?.emit("call:sdp-answer", { callId, sdp });
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

      // An answer is only valid while we hold a local offer
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
    if (!candidate) return;
    const pc = pcRef.current;

    if (!pc || !pc.remoteDescription) {
      iceCandidateQueueRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[webrtc] addIceCandidate error:", err.message);
    }
  }, []);

  const replaceVideoTrack = useCallback(async (newTrack) => {
    const pc = pcRef.current;
    if (!pc) return false;

    const transceiver = pc
      .getTransceivers()
      .find((t) => t.receiver.track.kind === "video");
    if (!transceiver) {
      console.warn("[webrtc] no video m-line negotiated; cannot swap track");
      return false;
    }
    if (transceiver.direction !== "sendrecv")
      transceiver.direction = "sendrecv";

    await transceiver.sender.replaceTrack(newTrack);
    if (newTrack) await applySenderQuality(pc, qualityRef.current);
    return true; // callers (screen share) rely on this to detect a failed hand-off
  }, []);

  const closeConnection = useCallback(() => {
    setupIdRef.current++; // cancel in-flight async setups
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    activeCallIdRef.current = null;
    iceCandidateQueueRef.current = [];
    qualityRef.current = "good";

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setNetworkQuality("good");
    setConnectionState("closed");
    setIceConnectionState("closed");
  }, []);

  useEffect(() => closeConnection, [closeConnection]);

  // Network came back (e.g. Wi-Fi reconnect) -> try to restart ICE
  useEffect(() => {
    const onOnline = () => {
      if (isOffererRef.current && pcRef.current) restartIce();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [restartIce]);

  // Adaptive quality: watch loss/RTT and cap bitrate accordingly
  useEffect(() => {
    if (connectionState !== "connected") return;

    const setQuality = (level) => {
      qualityRef.current = level;
      setNetworkQuality(level);
      applySenderQuality(pcRef.current, level);
    };
    applySenderQuality(pcRef.current, qualityRef.current);

    let goodStreak = 0;
    const id = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let loss = 0;
        stats.forEach((r) => {
          if (r.type === "remote-inbound-rtp") {
            if (r.roundTripTime) rtt = Math.max(rtt, r.roundTripTime);
            if (typeof r.fractionLost === "number")
              loss = Math.max(loss, r.fractionLost);
          }
          if (
            r.type === "candidate-pair" &&
            r.nominated &&
            r.currentRoundTripTime
          ) {
            rtt = Math.max(rtt, r.currentRoundTripTime);
          }
        });

        const next =
          loss > 0.1 || rtt > 0.6
            ? "poor"
            : loss > 0.03 || rtt > 0.3
              ? "fair"
              : "good";
        const cur = qualityRef.current;

        if (QUALITY_ORDER[next] > QUALITY_ORDER[cur]) {
          goodStreak = 0;
          setQuality(next); // degrade immediately
        } else if (QUALITY_ORDER[next] < QUALITY_ORDER[cur]) {
          if (++goodStreak >= 3) {
            goodStreak = 0;
            setQuality(next); // recover only after sustained improvement
          }
        } else {
          goodStreak = 0;
        }
      } catch {
        /* pc closed mid-poll */
      }
    }, 4000);

    return () => clearInterval(id);
  }, [connectionState]);

  return {
    pc: pcRef.current,
    remoteStream,
    connectionState,
    iceConnectionState,
    networkQuality,
    createOffer,
    handleOfferAndAnswer,
    handleAnswer,
    handleRemoteIceCandidate,
    restartIce,
    replaceVideoTrack,
    closeConnection,
  };
}
