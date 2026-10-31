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
  const startingShareRef = useRef(false); // a share is being set up (blocks double clicks)
  const stoppingShareRef = useRef(false); // a stop is running (blocks button + browser banner racing)
  const mediaEpochRef = useRef(0); // bumped when media is torn down; lets async work detect "the call ended"

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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Stops sharing and gives the call its camera back.
   * Best effort and NEVER throws: the local side is always cleaned up first, so
   * the UI can't get stuck in "sharing" even if the network side fails.
   */
  const stopScreenShare = useCallback(async (replaceTrackFn, notify) => {
    // Nothing to stop, or a stop is already running (button + browser banner at once)
    if (!screenTrackRef.current || stoppingShareRef.current) return false;
    stoppingShareRef.current = true;

    const replace = replaceTrackFn || shareHandlersRef.current.replaceTrackFn;
    const notifyFn = notify || shareHandlersRef.current.notify;
    const original = originalVideoTrackRef.current;
    const cameraOk = Boolean(original && original.readyState === "live");
    let restored = true;

    try {
      // 1) Local side first (cannot fail)
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;

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

      // 2) Hand the camera back to the peer connection (one retry)
      if (typeof replace === "function") {
        restored = false;
        for (let attempt = 0; attempt < 2 && !restored; attempt += 1) {
          try {
            restored = (await replace(cameraOk ? original : null)) !== false;
          } catch (err) {
            console.warn(
              "[devices] restoring camera after screen share failed:",
              err,
            );
          }
          if (!restored && attempt === 0) await sleep(300);
        }
        if (!restored) {
          console.warn(
            "[devices] could not restore the camera on the peer connection",
          );
        }
      }
    } catch (err) {
      console.warn("[devices] stopScreenShare error:", err);
      restored = false;
    } finally {
      // Always leave a consistent state, whatever happened above
      const cameraOn = Boolean(cameraOk && original && original.enabled);
      try {
        notifyFn?.("video", cameraOn);
        notifyFn?.("screen", false);
      } catch (err) {
        console.warn("[devices] notify failed:", err);
      }
      setIsVideoDisabled(!cameraOn);
      originalVideoTrackRef.current = null;
      shareHandlersRef.current = { replaceTrackFn: null, notify: null };
      setIsScreenSharing(false);
      stoppingShareRef.current = false;
    }
    return restored;
  }, []);

  /**
   * Starts sharing. Order matters: the screen track is handed to the peer
   * connection FIRST; the local stream and UI state change only after that
   * succeeded. If anything fails, everything acquired is released and the
   * camera is put back, so a failed attempt leaves no trace and can be retried.
   */
  const startScreenShare = useCallback(
    async (replaceTrackFn, notify) => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(
          "Screen sharing is not supported on this device/browser.",
        );
      }
      // Already sharing, or a start/stop is in progress (double click)
      if (
        screenTrackRef.current ||
        startingShareRef.current ||
        stoppingShareRef.current
      ) {
        return null;
      }

      startingShareRef.current = true;
      const epoch = mediaEpochRef.current;
      let screenStream = null;
      let screenTrack = null;
      let handedToPeer = false;

      const rollback = async () => {
        if (screenTrack) {
          screenTrack.onended = null;
          screenTrack.stop();
        }
        screenStream?.getTracks().forEach((t) => t.stop());
        if (screenTrackRef.current === screenTrack)
          screenTrackRef.current = null;
        shareHandlersRef.current = { replaceTrackFn: null, notify: null };

        // The peer connection already switched to the screen: put the camera back
        if (
          handedToPeer &&
          typeof replaceTrackFn === "function" &&
          epoch === mediaEpochRef.current
        ) {
          const camera = localStreamRef.current?.getVideoTracks()[0];
          try {
            await replaceTrackFn(
              camera && camera.readyState === "live" ? camera : null,
            );
          } catch (err) {
            console.warn(
              "[devices] could not restore camera after failed screen share:",
              err,
            );
          }
        }
      };

      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 15, max: 30 },
            width: { max: 1920 },
            height: { max: 1080 },
          },
          audio: false, // system audio would loop back into the call as echo
        });

        screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack)
          throw new Error("Screen capture did not provide any video.");
        try {
          screenTrack.contentHint = "detail";
        } catch {
          /* unsupported */
        }

        // The call ended while the browser's share picker was open
        if (epoch !== mediaEpochRef.current) {
          await rollback();
          return null;
        }

        screenTrackRef.current = screenTrack;
        shareHandlersRef.current = { replaceTrackFn, notify };

        // If the user clicks the browser's "Stop sharing" while we are still setting up
        let stoppedDuringSetup = false;
        screenTrack.onended = () => {
          stoppedDuringSetup = true;
        };

        // 1) Network side first. If this fails, nothing local has changed yet.
        if (typeof replaceTrackFn === "function") {
          const ok = await replaceTrackFn(screenTrack);
          if (ok === false) {
            throw new Error(
              "Couldn't start screen sharing because the call isn't connected yet.",
            );
          }
          handedToPeer = true;
        }

        if (
          stoppedDuringSetup ||
          screenTrack.readyState === "ended" ||
          epoch !== mediaEpochRef.current
        ) {
          await rollback();
          return null;
        }

        // 2) Commit local state (synchronous, cannot fail)
        const stream = localStreamRef.current || new MediaStream();
        const existing = stream.getVideoTracks()[0];
        if (existing) {
          originalVideoTrackRef.current = existing;
          stream.removeTrack(existing);
        }
        stream.addTrack(screenTrack);
        localStreamRef.current = stream;
        setLocalStream(new MediaStream(stream.getTracks()));

        screenTrack.onended = () => {
          stopScreenShare(); // browser "Stop sharing" banner
        };

        setIsScreenSharing(true);
        setIsVideoDisabled(false);

        try {
          notify?.("video", true);
          notify?.("screen", true); // lets the viewer skip mirroring/cropping
        } catch (err) {
          console.warn("[devices] notify failed:", err);
        }
        return screenStream;
      } catch (err) {
        await rollback();
        if (err?.name !== "NotAllowedError") {
          console.error("[devices] Screen sharing error:", err);
        }
        throw err;
      } finally {
        startingShareRef.current = false;
      }
    },
    [stopScreenShare],
  );

  const stopAllMedia = useCallback(() => {
    mediaEpochRef.current += 1; // anything still awaiting (share picker, negotiation) must now back off
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
