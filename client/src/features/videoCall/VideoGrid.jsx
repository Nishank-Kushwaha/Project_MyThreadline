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
        </div>
      </div>

      {!hasRemoteVideo && (
        <div className="flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="relative">
            <div className="absolute -inset-4 animate-ping rounded-full bg-primary/20 opacity-40" />
            <div className="absolute -inset-8 animate-pulse rounded-full bg-primary/10 opacity-30" />
            <Avatar
              src={peer?.avatarUrl}
              name={peer?.name}
              className="relative h-28 w-28 text-3xl ring-4 ring-background/50 shadow-2xl"
            />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-white tracking-tight">
              {peer?.name || "Participant"}
            </h3>
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
          </div>
        </div>
      )}
    </div>
  );
}
