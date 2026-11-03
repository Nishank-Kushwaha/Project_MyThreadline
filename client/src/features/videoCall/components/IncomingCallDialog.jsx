import React, { useEffect, useState, useCallback, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Phone, PhoneOff, Video, Loader2 } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { cn } from "@/lib/utils";

export function IncomingCallDialog() {
  const { callStatus, peer, callType, acceptCall, rejectCall } = useCall();
  const [countdown, setCountdown] = useState(30);
  const [actionState, setActionState] = useState(null); // null | "accepting" | "rejecting"

  // Synchronous lock to eliminate double-clicks & simultaneous multi-touch taps on mobile
  const lockRef = useRef(false);

  useEffect(() => {
    if (callStatus !== "incoming") {
      lockRef.current = false;
      setActionState(null);
      return;
    }

    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [callStatus]);

  // Symmetrical, robust action handlers with try-catch & multi-touch lock
  const handleAccept = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setActionState("accepting");

    try {
      await acceptCall();
    } catch (err) {
      console.error("[IncomingCall] acceptCall failed:", err);
      lockRef.current = false;
      setActionState(null);
    }
  }, [acceptCall]);

  const handleReject = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setActionState("rejecting");

    try {
      await rejectCall("declined");
    } catch (err) {
      console.error("[IncomingCall] rejectCall failed:", err);
      lockRef.current = false;
      setActionState(null);
    }
  }, [rejectCall]);

  // Keyboard accessibility: Enter to accept, Escape to decline on desktop
  useEffect(() => {
    if (callStatus !== "incoming") return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleReject();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleAccept();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [callStatus, handleAccept, handleReject]);

  if (callStatus !== "incoming" || !peer) return null;

  const isAccepting = actionState === "accepting";
  const isRejecting = actionState === "rejecting";
  const isBusy = actionState !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incoming Call"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xl animate-in fade-in duration-300"
    >
      <div className="relative w-full max-w-85 sm:max-w-sm overflow-hidden rounded-3xl bg-zinc-900/95 border border-white/10 p-6 sm:p-8 text-center shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl space-y-6 sm:space-y-7 transition-all">
        {/* Ambient Top Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-44 w-64 rounded-full bg-emerald-500/15 blur-3xl"
        />

        {/* Caller Avatar with Multi-layer Pulse Radar */}
        <div className="relative mx-auto flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-ping rounded-full bg-emerald-500/25 opacity-70 duration-1000"
          />
          <div
            aria-hidden="true"
            className="absolute -inset-3 animate-pulse rounded-full bg-emerald-500/10 duration-700"
          />
          <Avatar
            src={peer.avatarUrl}
            name={peer.name}
            className="relative h-24 w-24 sm:h-28 sm:w-28 text-2xl sm:text-3xl ring-4 ring-emerald-500/80 shadow-2xl transition-transform"
          />
        </div>

        {/* Caller Info & Call Badge */}
        <div className="space-y-2.5">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate px-2">
            {peer.name}
          </h2>

          <div className="flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-zinc-300 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {callType === "video" ? (
                <Video className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Phone className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>
                Incoming {callType === "video" ? "Video" : "Audio"} Call
              </span>
            </div>

            <span className="text-[11px] font-medium text-zinc-500">
              Auto declines in {countdown}s
            </span>
          </div>
        </div>

        {/* Action Buttons: Decline & Accept (Calm, Symmetrical & Balanced) */}
        <div className="flex items-center justify-center gap-10 sm:gap-14 pt-2">
          {/* DECLINE BUTTON */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div
                aria-hidden="true"
                className="absolute -inset-1 rounded-full bg-rose-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={isBusy}
                aria-label="Decline call"
                className={cn(
                  "relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full text-white",
                  "bg-linear-to-b from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500",
                  "border border-rose-400/30 shadow-lg shadow-red-950/50",
                  "transition-all duration-200 ease-out",
                  "hover:scale-105 active:scale-95 active:shadow-inner",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                  "disabled:opacity-50 disabled:pointer-events-none disabled:scale-100",
                )}
              >
                {isRejecting ? (
                  <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin" />
                ) : (
                  <PhoneOff className="h-6 w-6 sm:h-7 sm:w-7 transition-transform group-hover:rotate-12 duration-200" />
                )}
              </button>
            </div>
            <span className="text-xs font-medium text-zinc-400 tracking-wide">
              Decline
            </span>
          </div>

          {/* ACCEPT BUTTON */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div
                aria-hidden="true"
                className="absolute -inset-1 rounded-full bg-emerald-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
              <button
                type="button"
                onClick={handleAccept}
                disabled={isBusy}
                aria-label="Accept call"
                className={cn(
                  "relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full text-white",
                  "bg-linear-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500",
                  "border border-emerald-300/30 shadow-lg shadow-emerald-950/50",
                  "transition-all duration-200 ease-out",
                  "hover:scale-105 active:scale-95 active:shadow-inner",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                  "disabled:opacity-50 disabled:pointer-events-none disabled:scale-100",
                )}
              >
                {isAccepting ? (
                  <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin" />
                ) : callType === "video" ? (
                  <Video className="h-6 w-6 sm:h-7 sm:w-7 transition-transform group-hover:scale-110 duration-200" />
                ) : (
                  <Phone className="h-6 w-6 sm:h-7 sm:w-7 transition-transform group-hover:scale-110 duration-200" />
                )}
              </button>
            </div>
            <span className="text-xs font-medium text-zinc-400 tracking-wide">
              Accept
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
