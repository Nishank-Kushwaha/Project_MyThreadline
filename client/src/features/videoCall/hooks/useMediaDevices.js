import { useState, useRef, useCallback, useEffect } from "react";
import { formatMediaDeviceError } from "@/lib/utils";

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

// Phones often cannot open a second capture of the same kind while the first is still running
const BUSY_ERRORS = new Set([
  "NotReadableError",
  "AbortError",
  "TrackStartError",
]);

const PREF_KEY = "call.devicePrefs.v1";
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch {
    return {};
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable (private mode, quota): preferences just are not remembered */
  }
}

// Explicit user choice => "exact", so we never silently end up on a different device
const audioConstraintsFor = (id) => ({
  ...AUDIO_CONSTRAINTS,
  ...(id ? { deviceId: { exact: id } } : {}),
});
const videoConstraintsFor = ({ id, facing } = {}) => ({
  ...VIDEO_CONSTRAINTS,
  ...(id
    ? { deviceId: { exact: id } }
    : facing
      ? { facingMode: { exact: facing } }
      : { facingMode: "user" }),
});

function describeSwitchError(err, unavailableMessage) {
  const name = err?.name || "Error";
  let message;
  if (name === "OverconstrainedError" || name === "NotFoundError") {
    message = unavailableMessage || "That device isn't available anymore.";
  } else if (name === "NotAllowedError") {
    message = "Permission was denied for that device.";
  } else if (BUSY_ERRORS.has(name)) {
    message = "That device is being used by another app.";
  } else {
    message = err?.message || "Couldn't switch the device.";
  }
  const out = new Error(message);
  out.name = name;
  return out;
}

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
  // Remembered choices (microphone / speaker, and camera on desktop)
  const prefsRef = useRef(null);
  if (prefsRef.current === null) prefsRef.current = loadPrefs();

  const [localStream, setLocalStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [availableDevices, setAvailableDevices] = useState({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });
  const [selectedDevices, setSelectedDevices] = useState(() => ({
    audioInputId: "",
    videoInputId: "",
    audioOutputId: prefsRef.current?.audioOutputId || "",
  }));
  const [cameraFacing, setCameraFacing] = useState("user"); // "user" = front, "environment" = rear
  const [deviceError, setDeviceError] = useState(null);
  // Automatic events (device unplugged, fell back to default...) for the UI to announce
  const [deviceNotice, setDeviceNotice] = useState(null);

  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const shareHandlersRef = useRef({ replaceTrackFn: null, notify: null });
  const startingShareRef = useRef(false); // a share is being set up (blocks double clicks)
  const stoppingShareRef = useRef(false); // a stop is running (blocks button + browser banner racing)
  const mediaEpochRef = useRef(0); // bumped when media is torn down; lets async work detect "the call ended"
  const switchLockRef = useRef(Promise.resolve()); // device switches run one at a time
  const trackEndedRef = useRef(null); // latest "a device was unplugged" handler
  const cameraFacingRef = useRef("user");
  cameraFacingRef.current = cameraFacing;
  // Set by the call layer: how to push a new track to the other person
  const bindingsRef = useRef({
    replaceAudioTrack: null,
    replaceVideoTrack: null,
    notify: null,
  });

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Chrome lists a duplicate "Communications" entry for every audio device
      const real = (d) => d.deviceId !== "communications";
      const audioInputs = devices.filter(
        (d) => d.kind === "audioinput" && real(d),
      );
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const audioOutputs = devices.filter(
        (d) => d.kind === "audiooutput" && real(d),
      );
      setAvailableDevices({ audioInputs, videoInputs, audioOutputs });

      // The speaker we were using was unplugged: fall back to the system default
      setSelectedDevices((prev) =>
        prev.audioOutputId &&
        audioOutputs.length > 0 &&
        !audioOutputs.some((d) => d.deviceId === prev.audioOutputId)
          ? { ...prev, audioOutputId: "" }
          : prev,
      );
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

  // Tag a capture track and notice when the browser ends it by itself (device unplugged,
  // permission revoked). track.stop() does NOT fire "ended", so our own stops never trigger this.
  const watchTrack = useCallback((track, kind) => {
    try {
      track.contentHint = kind === "audio" ? "speech" : "motion";
    } catch {
      /* unsupported */
    }
    track.addEventListener("ended", () => trackEndedRef.current?.(track, kind));
  }, []);

  const adoptStream = useCallback(
    (stream, hasVideo) => {
      stream.getAudioTracks().forEach((t) => watchTrack(t, "audio"));
      stream.getVideoTracks().forEach((t) => watchTrack(t, "video"));

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsAudioMuted(false);
      setIsVideoDisabled(!hasVideo);

      // Remember which devices we really got (what the picker should tick)
      const a = stream.getAudioTracks()[0]?.getSettings?.() ?? {};
      const v = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      setSelectedDevices((prev) => ({
        ...prev,
        audioInputId: a.deviceId || "",
        videoInputId: v.deviceId || "",
      }));
      setCameraFacing(v.facingMode === "environment" ? "environment" : "user");

      enumerateDevices(); // labels become available after permission is granted
      return stream;
    },
    [enumerateDevices, watchTrack],
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
          buildConstraints({
            video,
            audio,
            audioId: audioId ?? prefsRef.current.audioInputId,
            // On phones a remembered camera id would silently pick the rear camera: always start on the front one
            videoId:
              videoId ??
              (IS_MOBILE ? undefined : prefsRef.current.videoInputId),
          }),
        );
        return adoptStream(stream, video);
      } catch (err) {
        // Camera missing/busy -> continue as audio-only instead of failing the call
        if (video && audio) {
          console.warn("[devices] video failed, trying audio-only:", err.name);
          try {
            const stream = await navigator.mediaDevices.getUserMedia(
              buildConstraints({
                video: false,
                audio: true,
                audioId: audioId ?? prefsRef.current.audioInputId,
              }),
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

  // ------------------------------------------------------------------------
  // LIVE DEVICE SWITCHING: microphone, camera, front/rear flip, speaker
  // ------------------------------------------------------------------------
  const runExclusive = useCallback((fn) => {
    const run = switchLockRef.current.then(fn);
    switchLockRef.current = run.catch(() => {});
    return run;
  }, []);

  const rememberDevice = useCallback((key, id) => {
    if (key === "videoInputId" && IS_MOBILE) return; // see acquireLocalStream
    prefsRef.current = { ...prefsRef.current, [key]: id || undefined };
    savePrefs(prefsRef.current);
  }, []);

  /**
   * Swap one capture track (mic or camera) while the call keeps running.
   *  - The new device is opened and handed to the peer connection BEFORE the
   *    old one is released, so a failed switch changes nothing.
   *  - Phones can't open two cameras at once: there the old camera is released
   *    first and, if the new one fails, the previous camera is put back.
   *  - Mute / camera-off state is carried over to the new track.
   *  - While screen sharing, the camera is "parked": we replace the parked one
   *    and leave the shared screen alone.
   */
  const swapCapture = useCallback(
    ({ kind, constraints, facing = null, unavailableMessage }) =>
      runExclusive(async () => {
        const stream = localStreamRef.current;
        if (!stream) throw new Error("Join or start a call first.");

        const sharing = kind === "video" && Boolean(screenTrackRef.current);
        const oldTrack =
          kind === "audio"
            ? (stream.getAudioTracks()[0] ?? null)
            : sharing
              ? originalVideoTrackRef.current
              : (stream.getVideoTracks()[0] ?? null);
        const oldDeviceId = oldTrack?.getSettings?.().deviceId;
        const keepEnabled = oldTrack ? oldTrack.enabled : true;
        const releaseFirst = kind === "video" && IS_MOBILE && Boolean(oldTrack);
        const baseConstraints =
          kind === "audio" ? AUDIO_CONSTRAINTS : VIDEO_CONSTRAINTS;

        const open = async (c) => {
          const s = await navigator.mediaDevices.getUserMedia({ [kind]: c });
          return s.getTracks()[0];
        };

        let oldStopped = false;
        const stopOld = () => {
          if (oldTrack && !oldStopped) {
            oldTrack.stop();
            oldStopped = true;
          }
        };

        // Tell the peer connection (no-op while sharing: it carries the screen)
        const publish = async (track) => {
          if (sharing) return true;
          const fn =
            kind === "audio"
              ? bindingsRef.current.replaceAudioTrack
              : bindingsRef.current.replaceVideoTrack;
          if (typeof fn !== "function") return true;
          return (await fn(track)) !== false;
        };

        const commit = (track) => {
          if (kind === "video" && sharing) {
            originalVideoTrackRef.current = track; // parked camera
            stopOld(); // release the previous parked camera (otherwise its light stays on)
            return;
          }
          if (oldTrack) stream.removeTrack(oldTrack);
          stopOld();
          if (track) stream.addTrack(track);
          setLocalStream(new MediaStream(stream.getTracks()));
        };

        const notifyPeer = (event, value) => {
          try {
            bindingsRef.current.notify?.(event, value);
          } catch (err) {
            console.warn("[devices] notify failed:", err);
          }
        };

        // We released the old device and the new one failed: put the old one back
        const recoverOld = async () => {
          let restored = null;
          try {
            restored = await open(
              oldDeviceId
                ? { ...baseConstraints, deviceId: { ideal: oldDeviceId } }
                : baseConstraints,
            );
            watchTrack(restored, kind);
            restored.enabled = keepEnabled;
            try {
              await publish(restored);
            } catch (err) {
              console.warn(
                "[devices] could not republish the previous device:",
                err,
              );
            }
          } catch {
            restored = null;
          }
          commit(restored);
          if (!restored && kind === "video" && !sharing) {
            setIsVideoDisabled(true);
            notifyPeer("video", false);
          }
        };

        let next = null;
        try {
          if (releaseFirst) stopOld();
          try {
            next = await open(constraints);
          } catch (err) {
            if (oldTrack && !oldStopped && BUSY_ERRORS.has(err.name)) {
              stopOld(); // device exclusive to one capture: release ours and retry
              next = await open(constraints);
            } else {
              throw err;
            }
          }

          watchTrack(next, kind);
          next.enabled = keepEnabled;

          const published = await publish(next);
          if (!published) {
            throw new Error(
              kind === "audio"
                ? "Couldn't switch the microphone on the call."
                : "Couldn't switch the camera on the call.",
            );
          }
        } catch (err) {
          next?.stop();
          if (oldStopped) await recoverOld();
          throw describeSwitchError(err, unavailableMessage);
        }

        commit(next);

        const settings = next.getSettings?.() ?? {};
        const key = kind === "audio" ? "audioInputId" : "videoInputId";
        setSelectedDevices((prev) => ({
          ...prev,
          [key]: settings.deviceId || "",
        }));
        rememberDevice(key, settings.deviceId);

        if (kind === "video") {
          const nextFacing =
            settings.facingMode === "environment" ||
            settings.facingMode === "user"
              ? settings.facingMode
              : facing || "user";
          setCameraFacing(nextFacing);
          if (!sharing) {
            setIsVideoDisabled(!keepEnabled);
            notifyPeer("video", keepEnabled);
          }
          notifyPeer("rearcam", nextFacing === "environment");
        }
        return next;
      }),
    [rememberDevice, runExclusive, watchTrack],
  );

  const switchMicrophone = useCallback(
    (deviceId = "") =>
      swapCapture({
        kind: "audio",
        constraints: audioConstraintsFor(deviceId),
        unavailableMessage: "That microphone isn't available anymore.",
      }),
    [swapCapture],
  );

  const switchCamera = useCallback(
    (deviceId = "") =>
      swapCapture({
        kind: "video",
        constraints: videoConstraintsFor({ id: deviceId }),
        unavailableMessage: "That camera isn't available anymore.",
      }),
    [swapCapture],
  );

  // Front <-> rear (phones)
  const flipCamera = useCallback(() => {
    const target =
      cameraFacingRef.current === "environment" ? "user" : "environment";
    return swapCapture({
      kind: "video",
      constraints: videoConstraintsFor({ facing: target }),
      facing: target,
      unavailableMessage:
        target === "environment"
          ? "This device doesn't have a rear camera."
          : "This device doesn't have a front camera.",
    });
  }, [swapCapture]);

  // The speaker is applied by <RemoteAudio/> (setSinkId); here we only keep the choice
  const setAudioOutput = useCallback(
    (deviceId = "") => {
      setSelectedDevices((prev) => ({ ...prev, audioOutputId: deviceId }));
      rememberDevice("audioOutputId", deviceId);
    },
    [rememberDevice],
  );

  // The camera died and no other camera could take over: leave the call cleanly without video
  const dropDeadCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    if (screenTrackRef.current) {
      originalVideoTrackRef.current = null; // nothing to go back to after the share
      return;
    }
    stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
    setLocalStream(new MediaStream(stream.getTracks()));
    try {
      await bindingsRef.current.replaceVideoTrack?.(null);
    } catch {
      /* peer connection already gone */
    }
    setIsVideoDisabled(true);
    try {
      bindingsRef.current.notify?.("video", false);
    } catch {
      /* ignore */
    }
  }, []);

  // A device was unplugged / its permission revoked mid-call: fall back to the default one
  trackEndedRef.current = async (track, kind) => {
    if (track === screenTrackRef.current) return;
    const stream = localStreamRef.current;
    const isCurrent =
      Boolean(stream && stream.getTracks().includes(track)) ||
      track === originalVideoTrackRef.current;
    if (!isCurrent) return;

    const notice = (level, message) =>
      setDeviceNotice({ id: Date.now(), level, message });

    if (kind === "audio") {
      try {
        await switchMicrophone("");
        notice(
          "warning",
          "Your microphone was disconnected. Switched to the default microphone.",
        );
      } catch {
        notice("error", "Your microphone was disconnected.");
      }
      return;
    }

    try {
      await switchCamera("");
      notice(
        "warning",
        "Your camera was disconnected. Switched to another camera.",
      );
    } catch {
      await dropDeadCamera();
      notice("error", "Your camera was disconnected.");
    }
  };

  const supportsOutputSelection =
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype;
  const canFlipCamera = IS_MOBILE && availableDevices.videoInputs.length > 1;

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
    setCameraFacing("user");
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
    deviceNotice,
    cameraFacing,
    canFlipCamera,
    supportsOutputSelection,
    refreshDevices: enumerateDevices,
    switchMicrophone,
    switchCamera,
    flipCamera,
    setAudioOutput,
    peerBindingsRef: bindingsRef,
    acquireLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    stopAllMedia,
  };
}
