import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Minimize2,
} from "lucide-react";
import { DevicePicker } from "./DevicePicker";
import { cn } from "@/lib/utils";

// Subcomponent: Circular call action button with active state styling
function CallControlButton({
  onClick,
  label,
  isActive = false,
  activeClassName = "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  inactiveClassName = "bg-muted text-foreground hover:bg-muted/80",
  className,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95",
        isActive ? activeClassName : inactiveClassName,
        className,
      )}
    >
      {children}
    </button>
  );
}

// Media and state control dock for active voice and video calls
export function CallControls({
  isAudioMuted,
  isVideoDisabled,
  isScreenSharing,
  callType,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleMinimize,
  onEndCall,
}) {
  // Check browser display media capture support for screen sharing
  const supportsScreenShare = Boolean(navigator.mediaDevices?.getDisplayMedia);

  return (
    <div className="relative flex items-center justify-center gap-3 rounded-full bg-background/80 p-2.5 shadow-2xl backdrop-blur-xl border border-border/40">
      {/* Microphone toggle */}
      <CallControlButton
        onClick={onToggleMic}
        label={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
        isActive={isAudioMuted}
      >
        {isAudioMuted ? (
          <MicOff className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </CallControlButton>

      {/* Camera toggle (video calls only) */}
      {callType === "video" && (
        <CallControlButton
          onClick={onToggleCamera}
          label={isVideoDisabled ? "Turn on camera" : "Turn off camera"}
          isActive={isVideoDisabled}
        >
          {isVideoDisabled ? (
            <VideoOff className="h-5 w-5" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </CallControlButton>
      )}

      {/* Screen sharing (supported desktop browsers on video calls) */}
      {supportsScreenShare && callType === "video" && (
        <CallControlButton
          onClick={onToggleScreenShare}
          label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          isActive={isScreenSharing}
          activeClassName="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ScreenShare className="h-5 w-5" />
        </CallControlButton>
      )}

      {/* Audio and video input/output device picker popover */}
      <DevicePicker />

      {/* Minimize to picture-in-picture floating view */}
      <CallControlButton
        onClick={onToggleMinimize}
        label="Minimize call"
      >
        <Minimize2 className="h-5 w-5" />
      </CallControlButton>

      {/* End call action */}
      <CallControlButton
        onClick={onEndCall}
        label="End call"
        className="bg-red-600 text-white shadow-lg shadow-red-600/30 hover:bg-red-700"
      >
        <PhoneOff className="h-5 w-5" />
      </CallControlButton>
    </div>
  );
}
