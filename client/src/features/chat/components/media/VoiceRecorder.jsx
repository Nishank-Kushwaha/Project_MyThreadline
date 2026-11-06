import React, { useEffect, useRef, useState } from "react";
import { Trash2, Send, Play, Pause, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useVoiceRecorder,
  MAX_SECONDS,
} from "@/features/chat/hooks/useVoiceRecorder";

const ICON_BTN =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 disabled:opacity-40";
const DISCARD_BTN = cn(
  ICON_BTN,
  "hover:bg-destructive/10 hover:text-destructive",
);
const NEUTRAL_BTN = cn(ICON_BTN, "hover:bg-muted hover:text-foreground");

// Seconds as m:ss
const formatTime = (s = 0) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Wraps a recording in a File; the duration is encoded in the name
const toVoiceFile = ({ blob, duration, ext, mimeType }) =>
  new File([blob], `voice-message-${Date.now()}_dur${duration}.${ext}`, {
    type: mimeType,
    lastModified: Date.now(),
  });

// Spinner while sending, plane icon otherwise
function SendIcon({ isSending }) {
  return isSending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Send className="h-4 w-4" />
  );
}

// Voice message bar: records with a live waveform, then previews before sending
export function VoiceRecorder({ onSendVoice, onCancel, isSending = false }) {
  const audioRef = useRef(null);
  const busyRef = useRef(false);
  const onCancelRef = useRef(onCancel); // latest onCancel, so the start effect runs only once
  onCancelRef.current = onCancel;

  const [preview, setPreview] = useState(null); // { url, blob, duration, ... }
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const showPreview = (snap) =>
    setPreview({ ...snap, url: URL.createObjectURL(snap.blob) });

  // At the limit the hook stops the recorder (mic released) and hands over the final recording
  const rec = useVoiceRecorder({
    maxSeconds: MAX_SECONDS,
    onMaxReached: (snap) => {
      toast.info(`Maximum length of ${formatTime(MAX_SECONDS)} reached.`);
      if (snap) showPreview(snap);
      else onCancelRef.current?.();
    },
  });

  const atLimit = rec.seconds >= rec.maxSeconds;
  const nearLimit = rec.seconds >= rec.maxSeconds - 30;

  // Start recording on mount
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

  // Free the preview URL when it changes or the bar unmounts
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  // Stops fully (releases the mic); null if the recording was empty
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

  const handleSendNow = async () => {
    const result = await finish();
    if (!result) return;
    showPreview(result);
    onSendVoice?.(toVoiceFile(result));
  };

  // Pauses (mic stays open) and shows the preview to listen, resume, discard or send
  const handleReview = async () => {
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

  // Continues the same recording after the paused part
  const handleResume = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setTime(0);
    if (rec.resume()) {
      setPreview(null); // the effect cleanup revokes the old URL
    } else {
      toast.error(
        atLimit
          ? `Maximum length of ${formatTime(rec.maxSeconds)} reached.`
          : "Couldn't resume recording.",
      );
    }
  };

  const handleDiscard = () => {
    rec.cancel();
    onCancelRef.current?.();
  };

  const handleSendPreview = () => onSendVoice?.(toVoiceFile(preview));

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const handleEnded = () => {
    setPlaying(false);
    setTime(0);
  };

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
              title={`Maximum ${formatTime(rec.maxSeconds)}`}
            >
              {formatTime(rec.seconds)}
            </span>
          </div>

          <div className="flex h-7 flex-1 items-center justify-center gap-0.75 overflow-hidden px-2">
            {rec.levels.map((level, i) => (
              <div
                key={i}
                style={{ height: `${Math.max(14, level * 100)}%` }}
                className={cn(
                  "w-1 rounded-full",
                  level > 0.3 ? "bg-primary" : "bg-primary/40",
                )}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isSending}
              aria-label="Discard recording"
              className={DISCARD_BTN}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleReview}
              disabled={
                isSending || !rec.isRecording || rec.isPaused || rec.seconds < 1
              }
              aria-label="Pause and review"
              title="Pause and review"
              className={NEUTRAL_BTN}
            >
              <Pause className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={handleSendNow}
              disabled={isSending || !rec.isRecording || rec.isPaused}
              aria-label="Send voice message"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <SendIcon isSending={isSending} />
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
            onEnded={handleEnded}
          />
          <button
            type="button"
            onClick={handleTogglePlay}
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
              <span>{formatTime(time)}</span>
              <span>{formatTime(preview.duration)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSending}
            aria-label="Discard recording"
            className={DISCARD_BTN}
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Resume only works while the recorder is still open and under the limit */}
          <button
            type="button"
            onClick={handleResume}
            disabled={isSending || !rec.isRecording || atLimit}
            aria-label="Resume recording"
            title={
              atLimit
                ? `Maximum length of ${formatTime(rec.maxSeconds)} reached`
                : "Resume recording"
            }
            className={NEUTRAL_BTN}
          >
            <Mic className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleSendPreview}
            disabled={isSending}
            aria-label="Send voice message"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md disabled:opacity-50"
          >
            <SendIcon isSending={isSending} />
          </button>
        </>
      )}
    </div>
  );
}
