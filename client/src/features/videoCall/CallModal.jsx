import React from "react";
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
    cancelCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  } = useCall();

  if (callStatus !== "calling" && callStatus !== "connected") {
    return null;
  }

  const phase =
    callStatus === "connected" ? getLinkPhase(connectionState) : null;
  const isLive = phase === "live";

  // 1. FLOATING MINIMIZED WINDOW (Picture-in-Picture inside App)
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex h-48 w-72 flex-col overflow-hidden rounded-2xl border border-white/20 bg-zinc-950 shadow-2xl transition animate-in fade-in zoom-in-95">
        <div className="relative flex-1">
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
          />

          {/* Quick Expand Button */}
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            aria-label="Maximize call"
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md hover:bg-black/80 transition"
          >
            <Maximize2 className="h-4 w-4" />
          </button>

          {/* Floating Status Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-md">
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
        </div>

        {/* Mini Controls Bar */}
        <div className="flex items-center justify-between bg-zinc-900 px-3 py-2 border-t border-white/10">
          <span className="truncate text-xs font-semibold text-white">
            {peer?.name}
          </span>
          <button
            type="button"
            onClick={callStatus === "calling" ? cancelCall : endCall}
            aria-label="End call"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>
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
        />

        {/* Connecting / Reconnecting pill over the video */}
        {callStatus === "connected" && !isLive && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2"
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md",
                phase === "reconnecting" ? "bg-amber-500/80" : "bg-black/60",
              )}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {phase === "reconnecting"
                  ? "Connection lost. Reconnecting…"
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
          isMinimized={isMinimized}
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
