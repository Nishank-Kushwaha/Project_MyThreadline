import { useState, useRef, useCallback, useEffect } from "react";
import { formatMediaDeviceError } from "../utils/callErrors";

const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Mono + all processing ON: browser echo cancellation works best on mono voice.
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

const VIDEO_CONSTRAINTS = IS_MOBILE
  ? {
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: { ideal: 24, max: 30 },
    }
  : {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    };

function buildConstraints({ video, audio, audioId, videoId }) {
  return {
    audio: audio
      ? {
          ...AUDIO_CONSTRAINTS,
          ...(audioId ? { deviceId: { ideal: audioId } } : {}),
        }
      : false,
    video: video
      ? {
          ...VIDEO_CONSTRAINTS,
          ...(videoId
            ? { deviceId: { ideal: videoId } }
            : { facingMode: "user" }),
        }
      : false,
  };
}

export function useMediaDevices() {
  const [localStream, setLocalStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [availableDevices, setAvailableDevices] = useState({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const [selectedDevices, setSelectedDevices] = useState({
    audioInputId: "",
    videoInputId: "",
    audioOutputId: "",
  });
  const [deviceError, setDeviceError] = useState(null);

  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const shareHandlersRef = useRef({ replaceTrackFn: null, notify: null });

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices({
        audioInputs: devices.filter((d) => d.kind === "audioinput"),
        videoInputs: devices.filter((d) => d.kind === "videoinput"),
        audioOutputs: devices.filter((d) => d.kind === "audiooutput"),
      });
    } catch (err) {
      console.warn("[devices] enumerateDevices error:", err);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices?.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        enumerateDevices,
      );
    };
  }, [enumerateDevices]);

  const adoptStream = useCallback(
    (stream, hasVideo) => {
      stream.getAudioTracks().forEach((t) => {
        try {
          t.contentHint = "speech";
        } catch {
          /* unsupported */
        }
        t.addEventListener("ended", () => {
          if (localStreamRef.current === stream) {
            setDeviceError("Your microphone was disconnected.");
          }
        });
      });
      stream.getVideoTracks().forEach((t) => {
        try {
          t.contentHint = "motion";
        } catch {
          /* unsupported */
        }
        t.addEventListener("ended", () => {
          if (
            localStreamRef.current === stream &&
            t !== screenTrackRef.current
          ) {
            setDeviceError("Your camera was disconnected.");
          }
        });
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsAudioMuted(false);
      setIsVideoDisabled(!hasVideo);
      enumerateDevices(); // labels become available after permission is granted
      return stream;
    },
    [enumerateDevices],
  );

  const acquireLocalStream = useCallback(
    async ({ video = true, audio = true, audioId, videoId } = {}) => {
      setDeviceError(null);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          buildConstraints({ video, audio, audioId, videoId }),
        );
        return adoptStream(stream, video);
      } catch (err) {
        // Camera missing/busy -> continue as audio-only instead of failing the call
        if (video && audio) {
          console.warn("[devices] video failed, trying audio-only:", err.name);
          try {
            const stream = await navigator.mediaDevices.getUserMedia(
              buildConstraints({ video: false, audio: true, audioId }),
            );
            return adoptStream(stream, false);
          } catch {
            /* fall through to original error */
          }
        }
        const msg = formatMediaDeviceError(err);
        setDeviceError(msg);
        throw new Error(msg);
      }
    },
    [adoptStream],
  );

  // Returns true when the mic is now LIVE
  const toggleAudio = useCallback((forceState) => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return false;
    const nextEnabled =
      forceState !== undefined ? Boolean(forceState) : !track.enabled;
    track.enabled = nextEnabled;
    setIsAudioMuted(!nextEnabled);
    return nextEnabled;
  }, []);

  // Returns true when the video is now ON
  const toggleVideo = useCallback((forceState) => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    const nextEnabled =
      forceState !== undefined ? Boolean(forceState) : !track.enabled;
    track.enabled = nextEnabled;
    setIsVideoDisabled(!nextEnabled);
    return nextEnabled;
  }, []);

  const stopScreenShare = useCallback(async (replaceTrackFn, notify) => {
    const replace = replaceTrackFn || shareHandlersRef.current.replaceTrackFn;
    const notifyFn = notify || shareHandlersRef.current.notify;

    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    const original = originalVideoTrackRef.current;
    const cameraOk = Boolean(original && original.readyState === "live");
    const stream = localStreamRef.current;

    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        if (t !== original) stream.removeTrack(t);
      });
      if (cameraOk && !stream.getVideoTracks().includes(original)) {
        stream.addTrack(original);
      }
      setLocalStream(new MediaStream(stream.getTracks()));
    }

    if (typeof replace === "function") {
      await replace(cameraOk ? original : null);
    }

    const cameraOn = cameraOk && original.enabled;
    notifyFn?.("video", cameraOn);
    setIsVideoDisabled(!cameraOn);
    originalVideoTrackRef.current = null;
    shareHandlersRef.current = { replaceTrackFn: null, notify: null };
    setIsScreenSharing(false);
  }, []);

  const startScreenShare = useCallback(
    async (replaceTrackFn, notify) => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(
          "Screen sharing is not supported on this device/browser.",
        );
      }
      if (screenTrackRef.current) return null;

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: false, // system audio would loop back into the call as echo
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      try {
        screenTrack.contentHint = "detail";
      } catch {
        /* unsupported */
      }
      screenTrackRef.current = screenTrack;
      shareHandlersRef.current = { replaceTrackFn, notify };

      const stream = localStreamRef.current || new MediaStream();
      const existing = stream.getVideoTracks()[0];
      if (existing) {
        originalVideoTrackRef.current = existing;
        stream.removeTrack(existing);
      }
      stream.addTrack(screenTrack);
      localStreamRef.current = stream;
      setLocalStream(new MediaStream(stream.getTracks()));

      if (typeof replaceTrackFn === "function") {
        await replaceTrackFn(screenTrack);
      }
      notify?.("video", true);

      // User clicked the browser's "Stop sharing" banner
      screenTrack.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
      setIsVideoDisabled(false);
      return screenStream;
    },
    [stopScreenShare],
  );

  const stopAllMedia = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    originalVideoTrackRef.current?.stop();
    originalVideoTrackRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    shareHandlersRef.current = { replaceTrackFn: null, notify: null };

    setLocalStream(null);
    setIsScreenSharing(false);
    setIsAudioMuted(false);
    setIsVideoDisabled(false);
  }, []);

  useEffect(() => stopAllMedia, [stopAllMedia]);

  const getLocalStream = useCallback(() => localStreamRef.current, []);

  return {
    localStream,
    getLocalStream,
    isAudioMuted,
    isVideoDisabled,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    setSelectedDevices,
    deviceError,
    acquireLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    stopAllMedia,
  };
}
