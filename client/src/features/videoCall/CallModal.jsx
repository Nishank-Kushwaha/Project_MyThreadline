import React from "react";
import { Lock, PhoneOff, Maximize2, ShieldCheck } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
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
    cancelCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  } = useCall();

  if (callStatus !== "calling" && callStatus !== "connected") {
    return null;
  }

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

          {/* Floating Duration Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{callStatus === "connected" ? formatDuration(duration) : "Calling…"}</span>
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
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {peer?.name}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
              {callStatus === "connected" ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono">{formatDuration(duration)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>DTLS-SRTP Encrypted</span>
                  </span>
                </>
              ) : (
                <span className="text-zinc-400 animate-pulse">Ringing…</span>
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
