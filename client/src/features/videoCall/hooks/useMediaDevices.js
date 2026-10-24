import { useState, useRef, useCallback, useEffect } from "react";
import { formatMediaDeviceError } from "../utils/callErrors";

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

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

      setAvailableDevices({ audioInputs, videoInputs, audioOutputs });
    } catch (err) {
      console.warn("[devices] enumerateDevices error:", err);
    }
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices?.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", enumerateDevices);
    };
  }, [enumerateDevices]);

  // Acquire user camera / microphone
  const acquireLocalStream = useCallback(
    async ({ video = true, audio = true, audioId, videoId } = {}) => {
      setDeviceError(null);

      // Stop existing tracks first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }

      const constraints = {
        audio: audio
          ? {
              deviceId: audioId ? { exact: audioId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              deviceId: videoId ? { exact: videoId } : undefined,
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              facingMode: "user",
            }
          : false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsAudioMuted(false);
        setIsVideoDisabled(!video);

        // Re-enumerate to get labels now that permission is granted
        enumerateDevices();
        return stream;
      } catch (err) {
        // If requesting video fails (e.g. no camera, or camera locked by another browser tab), try audio-only fallback
        if (video) {
          console.warn("[devices] Video request failed, attempting audio-only:", err.name);
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              audio: constraints.audio || true,
              video: false,
            });
            localStreamRef.current = fallbackStream;
            setLocalStream(fallbackStream);
            setIsAudioMuted(false);
            setIsVideoDisabled(true);
            enumerateDevices();
            return fallbackStream;
          } catch (audioErr) {
            try {
              const basicStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              localStreamRef.current = basicStream;
              setLocalStream(basicStream);
              setIsAudioMuted(false);
              setIsVideoDisabled(true);
              enumerateDevices();
              return basicStream;
            } catch (basicErr) {
              const msg = formatMediaDeviceError(basicErr);
              setDeviceError(msg);
              throw new Error(msg);
            }
          }
        }

        const msg = formatMediaDeviceError(err);
        setDeviceError(msg);
        throw new Error(msg);
      }
    },
    [enumerateDevices],
  );

  // Toggle Microphone Mute
  const toggleAudio = useCallback((forceState) => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = forceState !== undefined ? !forceState : audioTrack.enabled;
      audioTrack.enabled = !nextMuted;
      setIsAudioMuted(nextMuted);
      return !nextMuted; // returns audio active state
    }
    return false;
  }, []);

  // Toggle Camera Mute
  const toggleVideo = useCallback((forceState) => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const nextDisabled = forceState !== undefined ? !forceState : videoTrack.enabled;
      videoTrack.enabled = !nextDisabled;
      setIsVideoDisabled(nextDisabled);
      return !nextDisabled; // returns video active state
    }
    return false;
  }, []);

  // Screen Sharing
  const startScreenShare = useCallback(
    async (replaceTrackFn, onToggleCallback) => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported on this device/browser.");
      }

      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        // Keep local stream updated with screen share track
        const currentStream = localStreamRef.current || new MediaStream();
        const existingVideoTrack = currentStream.getVideoTracks()[0];
        if (existingVideoTrack) {
          originalVideoTrackRef.current = existingVideoTrack;
          currentStream.removeTrack(existingVideoTrack);
        }
        currentStream.addTrack(screenTrack);
        localStreamRef.current = currentStream;
        setLocalStream(new MediaStream(currentStream.getTracks()));

        // Call replaceTrackFn on the WebRTC peer connection
        if (typeof replaceTrackFn === "function") {
          await replaceTrackFn(screenTrack);
        } else if (replaceTrackFn && typeof replaceTrackFn.getTransceivers === "function") {
          const transceivers = replaceTrackFn.getTransceivers();
          const vt = transceivers.find(
            (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video",
          );
          if (vt) {
            vt.direction = "sendrecv";
            await vt.sender.replaceTrack(screenTrack);
          }
        }

        // Notify peer that video is now active
        if (typeof onToggleCallback === "function") {
          onToggleCallback("video", true);
        }

        // Handle user stopping screen share from browser banner ("Stop sharing")
        screenTrack.onended = () => {
          stopScreenShare(replaceTrackFn, onToggleCallback);
        };

        setIsScreenSharing(true);
        setIsVideoDisabled(false);
        return screenStream;
      } catch (err) {
        if (err.name !== "NotAllowedError") {
          console.error("[devices] Screen sharing error:", err);
        }
        throw err;
      }
    },
    [],
  );

  const stopScreenShare = useCallback(
    async (replaceTrackFn, onToggleCallback) => {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }

      const originalTrack = originalVideoTrackRef.current;
      const currentStream = localStreamRef.current;

      if (currentStream) {
        currentStream.getVideoTracks().forEach((track) => {
          if (track !== originalTrack) {
            currentStream.removeTrack(track);
          }
        });

        if (originalTrack && originalTrack.readyState === "live") {
          currentStream.addTrack(originalTrack);
        }
        localStreamRef.current = currentStream;
        setLocalStream(new MediaStream(currentStream.getTracks()));
      }

      if (typeof replaceTrackFn === "function") {
        await replaceTrackFn(originalTrack || null);
      } else if (replaceTrackFn && typeof replaceTrackFn.getTransceivers === "function") {
        const transceivers = replaceTrackFn.getTransceivers();
        const vt = transceivers.find(
          (t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video",
        );
        if (vt) {
          await vt.sender.replaceTrack(originalTrack || null);
        }
      }

      const hasLiveWebcam = Boolean(
        originalTrack && originalTrack.readyState === "live" && originalTrack.enabled,
      );
      if (typeof onToggleCallback === "function") {
        onToggleCallback("video", hasLiveWebcam);
      }

      setIsVideoDisabled(!hasLiveWebcam);
      originalVideoTrackRef.current = null;
      setIsScreenSharing(false);
    },
    [],
  );

  // Teardown all tracks on unmount
  const stopAllMedia = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (originalVideoTrackRef.current) {
      originalVideoTrackRef.current.stop();
      originalVideoTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsScreenSharing(false);
    setIsAudioMuted(false);
    setIsVideoDisabled(false);
  }, []);

  useEffect(() => {
    return () => {
      stopAllMedia();
    };
  }, [stopAllMedia]);

  // Synchronous stream getter to prevent React state closure staleness
  const getLocalStream = useCallback(() => {
    return localStreamRef.current;
  }, []);

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
