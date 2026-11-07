import React, { useRef, useEffect, useMemo, useState } from "react";
import { MicOff, VideoOff, Expand, Shrink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Viewport aspect ratio tolerance for auto-filling screen without excessive cropping
const FILL_TOLERANCE = 1.2;

// Insets to prevent call controls and header from occluding fitted video feeds
const HEADER_INSET = 64;
const CONTROLS_INSET = 100;
const SIDE_PAD = 12;

// Custom hook to bind a media stream to a HTML5 video element safely
function useBindVideo(ref, stream, deps = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    if (el.srcObject !== stream) {
      el.srcObject = stream || null;
    }
    if (stream) {
      el.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, ...deps]);
}

// Custom hook to track decoded video resolution changes (orientation / track switch)
function useVideoDims(ref, stream, deps = []) {
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const w = el.videoWidth;
      const h = el.videoHeight;
      setDims((p) => (p.w === w && p.h === h ? p : { w, h }));
    };

    el.addEventListener("loadedmetadata", read);
    el.addEventListener("resize", read);
    el.addEventListener("playing", read);
    read();

    return () => {
      el.removeEventListener("loadedmetadata", read);
      el.removeEventListener("resize", read);
      el.removeEventListener("playing", read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, ...deps]);

  return dims;
}

// Custom hook observing container dimensions via ResizeObserver
function useElementSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

// Animation driver converting raw audio levels into smoothed presence and level curves
function useLevelAnimation(active, levelRef, onFrame) {
  const stateRef = useRef({ presence: 0, level: 0 });
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const st = stateRef.current;
    let raf = 0;
    let last = performance.now();

    const ease = (current, target, dt, attackMs, releaseMs) =>
      current +
      (target - current) *
        (1 - Math.exp(-dt / (target > current ? attackMs : releaseMs)));

    const tick = (now) => {
      const dt = Math.min(64, now - last);
      last = now;

      const presenceTarget = active ? 1 : 0;
      const levelTarget = !active
        ? 0
        : reduced
          ? 0.5
          : Math.sqrt(levelRef?.current ?? 0);

      st.presence = ease(st.presence, presenceTarget, dt, 90, 300);
      st.level = ease(st.level, levelTarget, dt, 60, 220);

      const settled = !active && st.presence < 0.01 && st.level < 0.01;
      if (settled) {
        st.presence = 0;
        st.level = 0;
      }

      frameRef.current({
        presence: st.presence,
        level: st.level,
        t: now,
        reduced,
      });

      if (!settled) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, levelRef]);
}

// Subcomponent: Animated speaking indicator ring that gently glows and scales with volume
function SpeakingRing({ active, levelRef, inset = false, className }) {
  const ref = useRef(null);

  useLevelAnimation(active, levelRef, ({ presence, level }) => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = presence.toFixed(3);
    const blur = 6 + level * 14;
    const alpha = 0.1 + level * 0.18;
    el.style.boxShadow = `${inset ? "inset " : ""}0 0 ${blur.toFixed(1)}px 0 rgba(52, 211, 153, ${alpha.toFixed(3)})`;
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute border-2 border-emerald-400/90 opacity-0",
        className,
      )}
    />
  );
}

// Subcomponent: Dynamic three-bar audio level meter
function LevelBars({ active, levelRef, className }) {
  const barsRef = useRef([]);
  const weights = [0.75, 1, 0.85];

  useLevelAnimation(active, levelRef, ({ level, t, reduced }) => {
    barsRef.current.forEach((el, i) => {
      if (!el) return;
      const wobble = reduced
        ? 0
        : 0.12 * Math.sin(t / (110 + i * 40) + i * 1.7) * level;
      const h =
        0.22 + Math.min(1, Math.max(0, level * weights[i] + wobble)) * 0.78;
      el.style.transform = `scaleY(${h.toFixed(3)})`;
    });
  });

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-3.5 items-center gap-0.5 overflow-hidden transition-[width,opacity,margin] duration-200 ease-out",
        active ? "ml-1.5 w-3.25 opacity-100" : "ml-0 w-0 opacity-0",
        className,
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-0.75 origin-center rounded-full bg-emerald-400"
          style={{ transform: "scaleY(0.22)" }}
        />
      ))}
    </span>
  );
}

// Subcomponent: Fallback display when remote video is unavailable or turned off
function RemoteAvatarPlaceholder({
  peer,
  remoteStream,
  speaking,
  peerLevelRef,
  isAudioMuted,
  isMinimized,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isMinimized ? "gap-2 p-2 pb-12" : "gap-4 p-6",
      )}
    >
      <div className="relative">
        {!remoteStream && (
          <>
            <div
              className={cn(
                "absolute animate-ping rounded-full bg-primary/20 opacity-40",
                isMinimized ? "-inset-2" : "-inset-4",
              )}
            />
            <div
              className={cn(
                "absolute animate-pulse rounded-full bg-primary/10 opacity-30",
                isMinimized ? "-inset-4" : "-inset-8",
              )}
            />
          </>
        )}
        <Avatar
          src={peer?.avatarUrl}
          name={peer?.name}
          className={cn(
            "relative ring-background/50 shadow-2xl",
            isMinimized
              ? "h-20 w-20 text-xl ring-2"
              : "h-28 w-28 text-3xl ring-4",
          )}
        />
        <SpeakingRing
          active={speaking}
          levelRef={peerLevelRef}
          className={cn(
            "rounded-full",
            isMinimized ? "-inset-1.5" : "-inset-2",
          )}
        />
      </div>

      <div className="space-y-1">
        {!isMinimized && (
          <div className="flex items-center justify-center">
            <h3 className="text-xl font-semibold text-white tracking-tight">
              {peer?.name || "Participant"}
            </h3>
            <LevelBars active={speaking} levelRef={peerLevelRef} />
          </div>
        )}
        {isAudioMuted && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-red-400">
            <MicOff className="h-3.5 w-3.5" />
            <span>Microphone muted</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Subcomponent: Picture-in-picture local camera or screen preview feed
function LocalPipPreview({
  localVideoRef,
  localAspect,
  pipWidth,
  hasLocalVideo,
  currentUser,
  isScreenSharing,
  cameraFacing,
  isAudioMuted,
  selfActive,
  selfLevelRef,
}) {
  return (
    <div
      style={{
        aspectRatio: String(localAspect),
        width: pipWidth,
        maxHeight: "35vh",
      }}
      className="absolute right-4 top-4 z-20 overflow-hidden rounded-2xl bg-zinc-900 border-2 border-white/20 shadow-2xl"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "h-full w-full",
          isScreenSharing
            ? "bg-black object-contain"
            : cn(
                "object-cover",
                cameraFacing !== "environment" && "scale-x-[-1]",
              ),
          !hasLocalVideo && "hidden",
        )}
      />

      {!hasLocalVideo && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 p-2">
          <Avatar
            src={currentUser?.avatarUrl}
            name={currentUser?.name}
            className="h-12 w-12 text-sm"
          />
          <span className="flex items-center gap-1 text-[11px] text-zinc-400">
            <VideoOff className="h-3 w-3" />
            <span>Camera off</span>
          </span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-md">
        <span>You</span>
        {isAudioMuted && <MicOff className="h-2.5 w-2.5 text-red-400" />}
        <LevelBars
          active={selfActive}
          levelRef={selfLevelRef}
          className="h-2.5"
        />
      </div>

      <SpeakingRing
        active={selfActive}
        levelRef={selfLevelRef}
        inset
        className="inset-0 rounded-[inherit]"
      />
    </div>
  );
}

// Subcomponent: Toggle button to switch between fit-to-screen and fill-screen modes
function FitFillToggleButton({ mode, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={mode === "fit" ? "Fill screen" : "Fit to screen"}
      title={mode === "fit" ? "Fill screen" : "Fit to screen"}
      className="absolute left-4 top-21 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
    >
      {mode === "fit" ? (
        <Expand className="h-4 w-4" />
      ) : (
        <Shrink className="h-4 w-4" />
      )}
    </button>
  );
}

export function VideoGrid({
  localStream,
  remoteStream,
  peer,
  currentUser,
  callType,
  isVideoDisabled,
  isAudioMuted,
  peerMediaState,
  isScreenSharing = false,
  isMinimized = false,
  mirrorRemote = true,
  peerSpeaking = false,
  peerLevelRef = null,
  selfSpeaking = false,
  selfLevelRef = null,
  cameraFacing = "user",
}) {
  // Element and stream refs
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const backdropRef = useRef(null);

  // State hooks
  const [fitOverride, setFitOverride] = useState(null);

  // Video-only track streams to ensure no secondary audio paths
  const localVideoStream = useMemo(
    () => (localStream ? new MediaStream(localStream.getVideoTracks()) : null),
    [localStream],
  );
  const remoteVideoStream = useMemo(
    () =>
      remoteStream ? new MediaStream(remoteStream.getVideoTracks()) : null,
    [remoteStream],
  );

  // Derived media presence and speaking state flags
  const hasRemoteVideo =
    callType === "video" &&
    remoteStream &&
    !peerMediaState.isVideoDisabled &&
    remoteStream
      .getVideoTracks()
      .some((t) => t.readyState === "live" && !t.muted);

  const hasLocalVideo =
    callType === "video" &&
    localStream &&
    !isVideoDisabled &&
    localStream
      .getVideoTracks()
      .some((t) => t.readyState === "live" && t.enabled);

  const peerIsSharingScreen = Boolean(peerMediaState.isScreenSharing);
  const speaking = Boolean(peerSpeaking) && !peerMediaState.isAudioMuted;
  const selfActive = Boolean(selfSpeaking) && !isAudioMuted;

  // Measurement and element hooks
  useBindVideo(remoteVideoRef, remoteVideoStream, [
    peerMediaState.isVideoDisabled,
  ]);
  const remoteDims = useVideoDims(remoteVideoRef, remoteVideoStream);
  const viewport = useElementSize(containerRef);

  useBindVideo(localVideoRef, localVideoStream, [isVideoDisabled, isMinimized]);
  const localDims = useVideoDims(localVideoRef, localVideoStream, [
    isMinimized,
  ]);

  // Reset fit override to auto when screen share state changes
  useEffect(() => {
    setFitOverride(null);
  }, [peerIsSharingScreen]);

  // Aspect ratio calculations and layout mode resolution
  const known =
    remoteDims.w > 0 && remoteDims.h > 0 && viewport.w > 0 && viewport.h > 0;

  let autoMode = "fit";
  if (known && !peerIsSharingScreen) {
    const src = remoteDims.w / remoteDims.h;
    const view = viewport.w / viewport.h;
    const gap = Math.max(src / view, view / src);
    autoMode = gap <= FILL_TOLERANCE ? "fill" : "fit";
  }
  const mode = fitOverride ?? autoMode;

  const mirrorRemoteVideo =
    mirrorRemote && !peerIsSharingScreen && !peerMediaState.isRearCamera;
  const showBackdrop =
    Boolean(hasRemoteVideo) && mode === "fit" && !peerIsSharingScreen;

  useBindVideo(backdropRef, showBackdrop ? remoteVideoStream : null, [
    showBackdrop,
  ]);

  const insets = isMinimized
    ? { top: 0, bottom: 0, side: 0 }
    : { top: HEADER_INSET, bottom: CONTROLS_INSET, side: SIDE_PAD };

  let frame = null;
  if (mode === "fit" && known) {
    const availW = Math.max(1, viewport.w - insets.side * 2);
    const availH = Math.max(1, viewport.h - insets.top - insets.bottom);
    const scale = Math.min(availW / remoteDims.w, availH / remoteDims.h);
    frame = {
      w: Math.max(1, Math.floor(remoteDims.w * scale)),
      h: Math.max(1, Math.floor(remoteDims.h * scale)),
    };
  }

  const toggleFit = () => setFitOverride(mode === "fit" ? "fill" : "fit");

  const localAspect =
    hasLocalVideo && localDims.w > 0 && localDims.h > 0
      ? localDims.w / localDims.h
      : 3 / 4;
  const pipWidth =
    localAspect >= 1
      ? "clamp(8.5rem, 20vw, 13rem)"
      : "clamp(5.5rem, 12vw, 8.5rem)";

  return (
    <div
      ref={containerRef}
      onDoubleClick={isMinimized ? undefined : toggleFit}
      className="relative h-full w-full select-none overflow-hidden bg-zinc-950 flex items-center justify-center"
    >
      {/* Blurred ambient backdrop behind fitted remote video */}
      {showBackdrop && (
        <video
          ref={backdropRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 blur-2xl",
            mirrorRemoteVideo ? "-scale-x-110 scale-y-110" : "scale-110",
          )}
        />
      )}

      {/* Main remote video feed */}
      <div
        className={cn(
          "absolute inset-0 z-10 flex items-center justify-center",
          !hasRemoteVideo && "hidden",
        )}
        style={
          mode === "fit"
            ? {
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
                paddingLeft: insets.side,
                paddingRight: insets.side,
              }
            : undefined
        }
      >
        <div
          className={cn(
            "relative overflow-hidden",
            mode === "fit" && frame
              ? cn(
                  "bg-black shadow-2xl ring-1 ring-white/20",
                  !isMinimized &&
                    (peerIsSharingScreen ? "rounded-lg" : "rounded-2xl"),
                )
              : "h-full w-full",
          )}
          style={
            mode === "fit" && frame
              ? { width: frame.w, height: frame.h }
              : undefined
          }
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "h-full w-full",
              mode === "fill" ? "object-cover" : "object-contain",
              mirrorRemoteVideo && "scale-x-[-1]",
            )}
          />
          <SpeakingRing
            active={speaking}
            levelRef={peerLevelRef}
            inset
            className="inset-0 rounded-[inherit]"
          />
        </div>
      </div>

      {/* Fallback avatar view when remote video is off */}
      {!hasRemoteVideo && (
        <RemoteAvatarPlaceholder
          peer={peer}
          remoteStream={remoteStream}
          speaking={speaking}
          peerLevelRef={peerLevelRef}
          isAudioMuted={peerMediaState.isAudioMuted}
          isMinimized={isMinimized}
        />
      )}

      {/* Fit / Fill toggle button */}
      {hasRemoteVideo && !isMinimized && (
        <FitFillToggleButton mode={mode} onToggle={toggleFit} />
      )}

      {/* Picture-in-picture local video preview */}
      {!isMinimized && callType === "video" && (
        <LocalPipPreview
          localVideoRef={localVideoRef}
          localAspect={localAspect}
          pipWidth={pipWidth}
          hasLocalVideo={hasLocalVideo}
          currentUser={currentUser}
          isScreenSharing={isScreenSharing}
          cameraFacing={cameraFacing}
          isAudioMuted={isAudioMuted}
          selfActive={selfActive}
          selfLevelRef={selfLevelRef}
        />
      )}
    </div>
  );
}
