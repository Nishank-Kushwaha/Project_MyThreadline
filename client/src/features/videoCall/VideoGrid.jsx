import React, { useRef, useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import { MicOff, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

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
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Bind local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isVideoDisabled]);

  // Bind remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => {
        console.warn("[VideoGrid] remote video play error:", err);
      });
    }
  }, [remoteStream, peerMediaState.isVideoDisabled]);

  // Dedicated audio binding to guarantee remote audio ALWAYS plays
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch((err) => {
        console.warn("[VideoGrid] remote audio play error:", err);
      });
    }
  }, [remoteStream]);

  const hasRemoteVideo =
    callType === "video" &&
    remoteStream &&
    !peerMediaState.isVideoDisabled &&
    remoteStream.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);

  const hasLocalVideo =
    callType === "video" &&
    localStream &&
    !isVideoDisabled &&
    localStream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled);

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950 flex items-center justify-center">
      {/* 0. DEDICATED AUDIO ELEMENT - Always present in DOM for continuous, uninterrupted voice playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* 1. REMOTE FEED (Full Background) - muted so it does not conflict with dedicated audio element */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        muted
        className={cn("h-full w-full object-cover", !hasRemoteVideo && "hidden")}
      />

      {!hasRemoteVideo && (
        <div className="flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="relative">
            {/* Animated ripple wave rings */}
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

      {/* 2. LOCAL FEED (Picture-in-Picture in Corner) */}
      {!isMinimized && callType === "video" && (
        <div className="absolute right-4 top-4 z-20 h-40 w-28 sm:h-48 sm:w-36 overflow-hidden rounded-2xl bg-zinc-900 border-2 border-white/20 shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted // Always mute local video element to prevent echo feedback loop
            className={cn(
              "h-full w-full object-cover",
              !isScreenSharing && "scale-x-[-1]", // Don't mirror screen share
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

          {/* Local Status Indicators */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-md">
            <span>You</span>
            {isAudioMuted && <MicOff className="h-2.5 w-2.5 text-red-400" />}
          </div>
        </div>
      )}
    </div>
  );
}
