import React, { useRef, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { MicOff, VideoOff, Expand, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Auto layout: if the incoming video's shape is within this factor of the
 * viewport's shape we fill the viewport (crops at most ~15%). Otherwise we show
 * the WHOLE frame in a framed box that has exactly the video's own shape.
 */
const FILL_TOLERANCE = 1.2;

// Space kept free in "fit" mode so the call header / control bar never cover the picture
const HEADER_INSET = 64;
const CONTROLS_INSET = 100;
const SIDE_PAD = 12;

/** Bind a stream to a <video> only if it changed, and force muted in code. */
function useBindVideo(ref, stream, deps = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, ...deps]);
}

/** Real pixel size of the video being decoded (updates on rotation / source switch). */
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

/** Size of the area the video is shown in (updates on window resize / rotation / minimize). */
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

/**
 * Animation engine shared by the speaking ring and the level bars.
 *
 * Turns the raw audio level into two eased signals and calls `onFrame` every
 * frame ONLY while something is visible, then stops its own loop:
 *   presence : 0..1  "is this person talking"  (fast fade in, slower fade out)
 *   level    : 0..1  loudness (quick attack, slow release; square-root curve so
 *                    soft voices still register and loud ones do not blow out)
 * Time-based easing keeps it identical on 60 Hz and 120 Hz screens.
 * With "reduce motion" enabled the level stays steady instead of reacting.
 */
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
      if (!settled) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, levelRef]);
}

/**
 * Speaking indicator: a crisp thin ring that fades in when the person talks,
 * with a soft halo that swells gently with their volume.
 * Restrained on purpose (2px line, low-alpha halo), no neon.
 */
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

/**
 * Tiny three-bar voice meter (like Meet / Teams). Takes no space when silent
 * and slides open smoothly when the person speaks.
 */
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
  mirrorRemote = true, // mirror the peer's CAMERA like your own preview (never a screen share)
  peerSpeaking = false,
  peerLevelRef = null,
  selfSpeaking = false,
  selfLevelRef = null,
}) {
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const backdropRef = useRef(null);
  const [fitOverride, setFitOverride] = useState(null); // null = auto | "fit" | "fill"

  // VIDEO-ONLY streams: audio can never be played from these elements.
  const localVideoStream = useMemo(
    () => (localStream ? new MediaStream(localStream.getVideoTracks()) : null),
    [localStream],
  );
  const remoteVideoStream = useMemo(
    () =>
      remoteStream ? new MediaStream(remoteStream.getVideoTracks()) : null,
    [remoteStream],
  );

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

  // ---- measurements -------------------------------------------------------
  useBindVideo(remoteVideoRef, remoteVideoStream, [
    peerMediaState.isVideoDisabled,
  ]);
  const remoteDims = useVideoDims(remoteVideoRef, remoteVideoStream);
  const viewport = useElementSize(containerRef);

  useBindVideo(localVideoRef, localVideoStream, [isVideoDisabled, isMinimized]);
  const localDims = useVideoDims(localVideoRef, localVideoStream, [
    isMinimized,
  ]);

  // New source type (camera <-> screen) -> back to automatic layout
  useEffect(() => setFitOverride(null), [peerIsSharingScreen]);

  // ---- decide how to show the remote video --------------------------------
  const known =
    remoteDims.w > 0 && remoteDims.h > 0 && viewport.w > 0 && viewport.h > 0;

  let autoMode = "fit"; // safest default: show the whole frame
  if (known && !peerIsSharingScreen) {
    const src = remoteDims.w / remoteDims.h;
    const view = viewport.w / viewport.h;
    const gap = Math.max(src / view, view / src);
    autoMode = gap <= FILL_TOLERANCE ? "fill" : "fit";
  }
  const mode = fitOverride ?? autoMode; // screen shares are never auto-cropped

  const mirrorRemoteVideo = mirrorRemote && !peerIsSharingScreen;
  const showBackdrop =
    Boolean(hasRemoteVideo) && mode === "fit" && !peerIsSharingScreen;

  useBindVideo(backdropRef, showBackdrop ? remoteVideoStream : null, [
    showBackdrop,
  ]);

  // "fit" = a box with the video's OWN shape (phone-shaped for a phone camera),
  // as large as possible inside the space between the header and the controls.
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

  // ---- local preview shape follows the local camera / screen shape --------
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
      {/* Remote audio is played by <RemoteAudio/> (mounted in CallProvider), not here. */}

      {/* 0. DIMMED, BLURRED BACKDROP behind a framed camera video */}
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

      {/* 1. REMOTE FEED */}
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

      {!hasRemoteVideo && (
        <div
          className={cn(
            "flex flex-col items-center justify-center text-center",
            isMinimized ? "gap-2 p-2 pb-12" : "gap-4 p-6",
          )}
        >
          <div className="relative">
            {/* Gentle ripple only while we are still waiting for the other side's media */}
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
            {peerMediaState.isAudioMuted && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-red-400">
                <MicOff className="h-3.5 w-3.5" />
                <span>Microphone muted</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* 2. FIT / FILL TOGGLE (also: double-click the video) */}
      {hasRemoteVideo && !isMinimized && (
        <button
          type="button"
          onClick={toggleFit}
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
      )}

      {/* 3. LOCAL FEED (picture-in-picture, shaped like your own camera / screen) */}
      {!isMinimized && callType === "video" && (
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
                : "object-cover scale-x-[-1]",
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
      )}
    </div>
  );
}
