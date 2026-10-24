import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Minimize2,
  Maximize2,
} from "lucide-react";

export function CallControls({
  isAudioMuted,
  isVideoDisabled,
  isScreenSharing,
  isMinimized,
  callType,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleMinimize,
  onEndCall,
}) {
  const supportsScreenShare = Boolean(navigator.mediaDevices?.getDisplayMedia);

  return (
    <div className="flex items-center justify-center gap-3 rounded-full bg-background/80 p-2.5 shadow-2xl backdrop-blur-xl border border-border/40">
      {/* Toggle Microphone */}
      <button
        type="button"
        onClick={onToggleMic}
        aria-label={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          isAudioMuted
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-muted text-foreground hover:bg-muted/80"
        }`}
      >
        {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>

      {/* Toggle Camera (Only for video calls or if upgraded) */}
      {callType === "video" && (
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={isVideoDisabled ? "Turn on camera" : "Turn off camera"}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
            isVideoDisabled
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          {isVideoDisabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </button>
      )}

      {/* Screen Sharing (Desktop / Supported browsers) */}
      {supportsScreenShare && callType === "video" && !isMinimized && (
        <button
          type="button"
          onClick={onToggleScreenShare}
          aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
            isScreenSharing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          <ScreenShare className="h-5 w-5" />
        </button>
      )}

      {/* Minimize / Floating PiP Toggle */}
      <button
        type="button"
        onClick={onToggleMinimize}
        aria-label={isMinimized ? "Maximize call" : "Minimize call"}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/80"
      >
        {isMinimized ? <Maximize2 className="h-5 w-5" /> : <Minimize2 className="h-5 w-5" />}
      </button>

      {/* End Call Button */}
      <button
        type="button"
        onClick={onEndCall}
        aria-label="End call"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-95"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}
