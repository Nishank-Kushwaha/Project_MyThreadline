import React, { useEffect, useRef, useState } from "react";
import { Lock, PhoneOff, Maximize2, ShieldCheck, Loader2 } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { VideoGrid } from "./VideoGrid";
import { CallControls } from "./CallControls";

function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Media link phase while the call is accepted:
 *  - "live"          -> connected, media flowing
 *  - "reconnecting"  -> was live, connection dropped (ICE restart in progress)
 *  - "connecting"    -> still setting up (new / connecting / not created yet)
 */
function getLinkPhase(connectionState) {
  if (connectionState === "connected") return "live";
  if (connectionState === "disconnected" || connectionState === "failed")
    return "reconnecting";
  return "connecting";
}

/** Signal bars: green = good, amber = weak, red = poor. Label only shown when not good. */
function NetworkIndicator({ quality = "good" }) {
  const level = quality === "poor" ? 1 : quality === "fair" ? 2 : 3;
  const barColor =
    quality === "poor"
      ? "bg-red-500"
      : quality === "fair"
        ? "bg-amber-400"
        : "bg-emerald-500";
  const label =
    quality === "poor"
      ? "Poor connection"
      : quality === "fair"
        ? "Weak connection"
        : "Good connection";

  return (
    <span
      className="flex items-center gap-1.5"
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-0.75 rounded-sm transition-colors",
              i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3.5",
              i <= level ? barColor : "bg-white/25",
            )}
          />
        ))}
      </span>
      {quality !== "good" && (
        <span
          className={cn(
            "text-xs font-medium",
            quality === "poor" ? "text-red-400" : "text-amber-300",
          )}
        >
          {quality === "poor" ? "Poor connection" : "Weak connection"}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DRAGGABLE MINIMIZED WINDOW
// ---------------------------------------------------------------------------
const MINI_W = 288; // matches the old w-72
const MINI_H = 192; // matches the old h-48
const MINI_MARGIN = 16;

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 720 : window.innerHeight,
  }));

  useEffect(() => {
    const update = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return size;
}

/** corner is one of "tl" | "tr" | "bl" | "br" */
function cornerPosition(corner, vw, vh) {
  const x = corner.includes("l")
    ? MINI_MARGIN
    : Math.max(MINI_MARGIN, vw - MINI_W - MINI_MARGIN);
  const y = corner.includes("t")
    ? MINI_MARGIN
    : Math.max(MINI_MARGIN, vh - MINI_H - MINI_MARGIN);
  return { x, y };
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Floating call window. Drag it anywhere with a mouse or finger; on release it
 * glides to the nearest screen corner. Buttons inside stay clickable.
 * The corner is owned by the parent so it is remembered after maximizing.
 */
function DraggableMiniWindow({ corner, onCornerChange, children }) {
  const { w: vw, h: vh } = useViewportSize();
  const [drag, setDrag] = useState(null); // {x, y} while dragging, else null
  const gestureRef = useRef(null);

  const resting = cornerPosition(corner, vw, vh);
  const pos = drag ?? resting;

  const positionFromPointer = (e) => {
    const g = gestureRef.current;
    return {
      x: clamp(g.originX + (e.clientX - g.startX), 0, Math.max(0, vw - MINI_W)),
      y: clamp(g.originY + (e.clientY - g.startY), 0, Math.max(0, vh - MINI_H)),
    };
  };

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return; // primary button / touch only
    if (e.target.closest("button")) return; // let buttons work normally

    e.currentTarget.setPointerCapture?.(e.pointerId);
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: resting.x,
      originY: resting.y,
    };
    setDrag({ ...resting });
  };

  const handlePointerMove = (e) => {
    if (!gestureRef.current) return;
    setDrag(positionFromPointer(e));
  };

  const finishDrag = (e) => {
    if (!gestureRef.current) return;
    const { x, y } = positionFromPointer(e);
    gestureRef.current = null;
    setDrag(null);

    // Snap to whichever corner the window's center is closest to
    const centerX = x + MINI_W / 2;
    const centerY = y + MINI_H / 2;
    onCornerChange(
      `${centerY < vh / 2 ? "t" : "b"}${centerX < vw / 2 ? "l" : "r"}`,
    );
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onDragStart={(e) => e.preventDefault()} // stop the browser's native image drag (avatar ghost)
      style={{
        width: MINI_W,
        height: MINI_H,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
      className={cn(
        "fixed left-0 top-0 z-50 touch-none select-none overflow-hidden rounded-2xl border border-white/20 bg-zinc-950 shadow-2xl [&_img]:pointer-events-none [&_img]:select-none [&_img]:[-webkit-user-drag:none]",
        drag
          ? "cursor-grabbing"
          : "cursor-grab transition-transform duration-200 ease-out",
      )}
    >
      <div className="flex h-full w-full flex-col animate-in fade-in duration-200">
        {children}
      </div>

      {/* Little grip so people can tell it is draggable */}
      <span className="pointer-events-none absolute left-1/2 top-1.5 z-30 h-1 w-8 -translate-x-1/2 rounded-full bg-white/40" />
    </div>
  );
}

export function CallModal() {
  const { user: currentUser } = useAuth();
  const {
    callStatus,
    callType,
    peer,
    duration,
    isMinimized,
    setIsMinimized,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoDisabled,
    isScreenSharing,
    peerMediaState,
    connectionState,
    networkQuality,
    peerSpeaking,
    peerLevelRef,
    selfSpeaking,
    selfLevelRef,
    peerReconnecting,
    cancelCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  } = useCall();

  // Remembered between minimize / maximize (must stay above the early return)
  const [miniCorner, setMiniCorner] = useState("br");

  if (callStatus !== "calling" && callStatus !== "connected") {
    return null;
  }

  const phase =
    callStatus === "connected" ? getLinkPhase(connectionState) : null;
  const isLive = phase === "live";

  // 1. FLOATING MINIMIZED WINDOW (draggable, snaps to corners)
  if (isMinimized) {
    return (
      <DraggableMiniWindow corner={miniCorner} onCornerChange={setMiniCorner}>
        <div className="relative min-h-0 flex-1">
          <VideoGrid
            localStream={localStream}
            remoteStream={remoteStream}
            peer={peer}
            currentUser={currentUser}
            callType={callType}
            isVideoDisabled={isVideoDisabled}
            isAudioMuted={isAudioMuted}
            peerMediaState={peerMediaState}
            isScreenSharing={isScreenSharing}
            isMinimized={true}
            peerSpeaking={peerSpeaking}
            peerLevelRef={peerLevelRef}
            selfSpeaking={selfSpeaking}
            selfLevelRef={selfLevelRef}
          />

          {/* Quick Expand Button */}
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            aria-label="Maximize call"
            className="absolute top-2 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 transition"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          {/* Floating Status Badge */}
          <div className="pointer-events-none absolute top-2 left-2 z-30 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-md">
            {callStatus === "calling" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Calling…</span>
              </>
            ) : isLive ? (
              <>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    networkQuality === "poor"
                      ? "bg-red-500"
                      : networkQuality === "fair"
                        ? "bg-amber-400"
                        : "bg-emerald-500 animate-pulse",
                  )}
                />
                <span>{formatDuration(duration)}</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {phase === "reconnecting" ? "Reconnecting…" : "Connecting…"}
                </span>
              </>
            )}
          </div>

          {/* Mini name + end-call bar: overlays the video, ~90% transparent */}
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 bg-black/10 px-3 py-2">
            <span className="truncate text-xs font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              {peer?.name}
            </span>
            <button
              type="button"
              onClick={callStatus === "calling" ? cancelCall : endCall}
              aria-label="End call"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-black/40 hover:bg-red-700 transition"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DraggableMiniWindow>
    );
  }

  // 2. FULLSCREEN VIEWPORT
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 bg-linear-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {peer?.name}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
              {callStatus === "calling" ? (
                <span className="text-zinc-400 animate-pulse">Ringing…</span>
              ) : isLive ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono">{formatDuration(duration)}</span>
                  <span>•</span>
                  <NetworkIndicator quality={networkQuality} />
                  <span>•</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>DTLS-SRTP Encrypted</span>
                  </span>
                </>
              ) : (
                <span
                  className={cn(
                    "flex items-center gap-1.5",
                    phase === "reconnecting"
                      ? "text-amber-300"
                      : "text-zinc-300",
                  )}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {phase === "reconnecting" ? "Reconnecting…" : "Connecting…"}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* E2EE Lock Indicator */}
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white backdrop-blur-md">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">End-to-End Encrypted</span>
        </div>
      </header>

      {/* Main Video Viewport */}
      <main className="relative flex-1">
        <VideoGrid
          localStream={localStream}
          remoteStream={remoteStream}
          peer={peer}
          currentUser={currentUser}
          callType={callType}
          isVideoDisabled={isVideoDisabled}
          isAudioMuted={isAudioMuted}
          peerMediaState={peerMediaState}
          isScreenSharing={isScreenSharing}
          isMinimized={false}
          peerSpeaking={peerSpeaking}
          peerLevelRef={peerLevelRef}
          selfSpeaking={selfSpeaking}
          selfLevelRef={selfLevelRef}
        />

        {/* Connecting / Reconnecting pill over the video */}
        {callStatus === "connected" && (!isLive || peerReconnecting) && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2"
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md",
                phase === "reconnecting" || peerReconnecting
                  ? "bg-amber-500/80"
                  : "bg-black/60",
              )}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {phase === "reconnecting"
                  ? "Connection lost. Reconnecting…"
                  : peerReconnecting
                    ? `${peer?.name || "The other person"} lost connection. Waiting for them to return…`
                    : "Connecting…"}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Floating Control Bar */}
      <footer className="absolute bottom-6 left-0 right-0 z-30 flex justify-center px-4">
        <CallControls
          isAudioMuted={isAudioMuted}
          isVideoDisabled={isVideoDisabled}
          isScreenSharing={isScreenSharing}
          callType={callType}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleMinimize={() => setIsMinimized(true)}
          onEndCall={callStatus === "calling" ? cancelCall : endCall}
        />
      </footer>
    </div>
  );
}
