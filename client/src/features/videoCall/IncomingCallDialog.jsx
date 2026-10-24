import React, { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCall } from "@/context/CallContext";

export function IncomingCallDialog() {
  const { callStatus, peer, callType, acceptCall, rejectCall } = useCall();
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (callStatus !== "incoming") return;

    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [callStatus]);

  if (callStatus !== "incoming" || !peer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 p-6 text-center shadow-2xl space-y-6">
        {/* Caller Avatar & Radar Glow */}
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20 opacity-75" />
          <div className="absolute -inset-2 animate-pulse rounded-full bg-emerald-500/10" />
          <Avatar
            src={peer.avatarUrl}
            name={peer.name}
            className="h-24 w-24 text-2xl ring-4 ring-emerald-500 shadow-xl"
          />
        </div>

        {/* Caller Info */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {peer.name}
          </h2>
          <p className="flex items-center justify-center gap-1.5 text-sm text-zinc-400">
            {callType === "video" ? (
              <>
                <Video className="h-4 w-4 text-emerald-400" />
                <span>Incoming video call…</span>
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 text-emerald-400" />
                <span>Incoming audio call…</span>
              </>
            )}
          </p>
          <span className="inline-block text-[11px] font-medium text-zinc-500">
            Auto declines in {countdown}s
          </span>
        </div>

        {/* Action Buttons: Decline / Accept */}
        <div className="flex items-center justify-center gap-8 pt-2">
          {/* Decline Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => rejectCall("declined")}
              aria-label="Decline call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 transition hover:bg-red-700 active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-xs text-zinc-400">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={acceptCall}
              aria-label="Accept call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95 animate-bounce duration-1000"
            >
              {callType === "video" ? (
                <Video className="h-7 w-7" />
              ) : (
                <Phone className="h-7 w-7" />
              )}
            </button>
            <span className="text-xs text-emerald-400 font-medium">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
