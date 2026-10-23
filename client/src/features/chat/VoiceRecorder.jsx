import React, { useEffect, useRef, useState } from "react";
import { Trash2, Send, Play, Pause, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoiceRecorder, MAX_SECONDS } from "./useVoiceRecorder";

const fmt = (s = 0) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const toFile = ({ blob, duration, ext, mimeType }) =>
  new File([blob], `voice-message-${Date.now()}_dur${duration}.${ext}`, {
    type: mimeType,
    lastModified: Date.now(),
  });

export function VoiceRecorder({ onSendVoice, onCancel, isSending = false }) {
  const [preview, setPreview] = useState(null); // { url, blob, duration, ... }
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const audioRef = useRef(null);
  const busyRef = useRef(false);

  const showPreview = (snap) =>
    setPreview({ ...snap, url: URL.createObjectURL(snap.blob) });

  // When the limit is hit the hook fully STOPS the recorder (mic released) and
  // calls this with the final recording, so we land in preview mode. Resume is
  // disabled there because rec.isRecording is false.
  const rec = useVoiceRecorder({
    maxSeconds: MAX_SECONDS,
    onMaxReached: (snap) => {
      toast.info(`Maximum length of ${fmt(MAX_SECONDS)} reached.`);
      if (snap) showPreview(snap);
      else onCancelRef.current?.();
    },
  });

  // Keep latest onCancel in a ref → the start effect runs ONCE (fixes the restart bug)
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    rec.start().catch((err) => {
      console.error("Recorder start failed:", err);
      toast.error(
        err?.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : err?.name === "NotSupportedError"
            ? "Voice recording isn't supported in this browser."
            : "Could not access microphone.",
      );
      onCancelRef.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  // Stop completely (releases the mic). Used by "send now".
  const finish = async () => {
    if (busyRef.current) return null;
    busyRef.current = true;
    const result = await rec.stop();
    busyRef.current = false;
    if (!result) {
      toast.error("Recording was too short or empty.");
      onCancelRef.current?.();
    }
    return result;
  };

  const sendNow = async () => {
    const r = await finish();
    if (!r) return;
    showPreview(r);
    onSendVoice?.(toFile(r));
  };

  // Pause (mic stays open) and show the preview so the user can listen,
  // then Resume, Discard or Send.
  const review = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const snap = await rec.pause();
      if (!snap) {
        toast.error("Recording was too short or empty.");
        onCancelRef.current?.();
        return;
      }
      showPreview(snap);
    } finally {
      busyRef.current = false;
    }
  };

  // Go back to recording: continues the SAME recording after the paused part.
  const resume = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setTime(0);
    if (rec.resume()) {
      setPreview(null); // effect cleanup revokes the old preview URL
    } else {
      toast.error(
        rec.seconds >= rec.maxSeconds
          ? `Maximum length of ${fmt(rec.maxSeconds)} reached.`
          : "Couldn't resume recording.",
      );
    }
  };

  const discard = () => {
    rec.cancel();
    onCancelRef.current?.();
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play().catch(() => {});
  };

  const atLimit = rec.seconds >= rec.maxSeconds;
  const nearLimit = rec.seconds >= rec.maxSeconds - 30;

  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 disabled:opacity-40";

  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-3xl border border-primary/20 bg-secondary/80 px-3 py-1.5 shadow-sm">
      {!preview ? (
        <>
          <div className="flex shrink-0 items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span
              className={cn(
                "font-mono text-xs font-semibold",
                nearLimit && "text-red-500",
              )}
              title={`Maximum ${fmt(rec.maxSeconds)}`}
            >
              {fmt(rec.seconds)}
            </span>
          </div>

          <div className="flex h-7 flex-1 items-center justify-center gap-0.75 overflow-hidden px-2">
            {rec.levels.map((l, i) => (
              <div
                key={i}
                style={{ height: `${Math.max(14, l * 100)}%` }}
                className={cn(
                  "w-1 rounded-full",
                  l > 0.3 ? "bg-primary" : "bg-primary/40",
                )}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={discard}
              disabled={isSending}
              aria-label="Discard recording"
              className={cn(
                iconBtn,
                "hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={review}
              disabled={
                isSending || !rec.isRecording || rec.isPaused || rec.seconds < 1
              }
              aria-label="Pause and review"
              title="Pause and review"
              className={cn(iconBtn, "hover:bg-muted hover:text-foreground")}
            >
              <Pause className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={sendNow}
              disabled={isSending || !rec.isRecording || rec.isPaused}
              aria-label="Send voice message"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <audio
            ref={audioRef}
            src={preview.url}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setTime(0);
            }}
          />
          <button
            type="button"
            onClick={togglePlay}
            disabled={isSending}
            aria-label={playing ? "Pause preview" : "Play preview"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          <div className="min-w-0 flex-1 px-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(100, (time / preview.duration) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-0.5 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{fmt(time)}</span>
              <span>{fmt(preview.duration)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={discard}
            disabled={isSending}
            aria-label="Discard recording"
            className={cn(
              iconBtn,
              "hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Resume: only while the recorder is still open (paused) and below the limit */}
          <button
            type="button"
            onClick={resume}
            disabled={isSending || !rec.isRecording || atLimit}
            aria-label="Resume recording"
            title={
              atLimit
                ? `Maximum length of ${fmt(rec.maxSeconds)} reached`
                : "Resume recording"
            }
            className={cn(iconBtn, "hover:bg-muted hover:text-foreground")}
          >
            <Mic className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onSendVoice?.(toFile(preview))}
            disabled={isSending}
            aria-label="Send voice message"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
