import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "GIF" in a chat is really a short, silent, looping MP4.
 * WhatsApp shows it as a bare bubble: first frame + round "GIF" badge,
 * no seek bar, no volume, no duration chip. Tap plays it muted, loops it
 * a few times (3 by default), then stops on the last frame and the badge
 * comes back. Tapping again replays it from the start.
 *
 * Detection (sender side should set media.isGif when it can):
 *   1. explicit flag: media.isGif / media.gifPlayback
 *   2. filename hint: "*.gif.mp4", "*_gif.mp4", "*.gif"
 */
export function isGifVideo(media, kind) {
  if (kind !== "video" || !media) return false;
  if (media.isGif === true || media.gifPlayback === true) return true;
  const name = String(media.fileName || "").toLowerCase();
  return /(^|[._\-\s])gif([._\-\s]|$)/.test(name);
}

export function GifVideoPlayer({
  src,
  isLoading,
  error,
  timeLabel, // e.g. "9:36 am" — optional, shown bottom-right like WhatsApp
  loopCount = 3, // plays this many times, then stops on the last frame
  onError,
  className,
}) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [aspect, setAspect] = useState(null); // keep the real ratio, no letterbox
  const wraps = useRef(0); // times the native loop wrapped back to 0:00
  const lastTime = useRef(0);
  const finished = useRef(false); // true once stopped on the last frame
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onMeta = () => {
      if (v.videoWidth && v.videoHeight) {
        setAspect(v.videoWidth / v.videoHeight);
      }
      // Paint the first frame as the poster (needed on iOS Safari).
      if (v.currentTime === 0) v.currentTime = 0.001;
    };
    const onPause = () => {
      if (!v.ended) setIsPlaying(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    // Native loop does the looping (seamless, no ended->play() race).
    // We only count wraps, and switch loop off for the final pass so the
    // clip ends naturally and holds on its last frame.
    const countWrap = (t) => {
      if (t < lastTime.current - 0.1 && !v.seeking) {
        wraps.current += 1;
        if (wraps.current >= loopCount - 1) v.loop = false;
      }
      lastTime.current = t;
    };
    const onTimeUpdate = () => countWrap(v.currentTime);
    let vfcId = null;
    const vfc = (_now, meta) => {
      countWrap(meta.mediaTime);
      vfcId = v.requestVideoFrameCallback(vfc);
    };
    const onPlayStart = () => {
      setIsPlaying(true);
      if (typeof v.requestVideoFrameCallback === "function" && vfcId === null)
        vfcId = v.requestVideoFrameCallback(vfc);
    };
    const onEnded = () => {
      finished.current = true; // final pass done: hold on the last frame
      setIsPlaying(false);
    };

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlayStart);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    const onErr = (e) => onErrorRef.current?.(e);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlayStart);
      v.removeEventListener("timeupdate", onTimeUpdate);
      if (vfcId !== null && v.cancelVideoFrameCallback)
        v.cancelVideoFrameCallback(vfcId);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
    };
  }, [src, loopCount]);

  // Pause when scrolled out of view so a long chat doesn't keep decoding.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !v.paused) v.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    if (finished.current || v.ended) {
      // Replay from the start with a fresh loop count.
      finished.current = false;
      wraps.current = 0;
      lastTime.current = 0;
      v.loop = loopCount > 1;
      v.currentTime = 0;
    } else {
      // First play, or resume after a pause: loop only while passes remain.
      v.loop = wraps.current < loopCount - 1;
    }
    v.play().catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-black/10 dark:bg-white/10">
        <Loader2 className="h-5 w-5 animate-spin opacity-70" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-24 w-48 items-center justify-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={isPlaying ? "Pause GIF" : "Play GIF"}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      style={aspect ? { aspectRatio: String(aspect) } : undefined}
      className={cn(
        "relative max-h-72 min-h-24 w-auto max-w-[16rem] cursor-pointer select-none overflow-hidden rounded-lg bg-black",
        "focus-visible:outline focus-visible:outline-primary",
        className,
      )}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto" // GIFs are tiny; load them so the first frame shows
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        className="h-full w-full object-cover"
      />

      {/* Round "GIF" badge: visible only while stopped */}
      {!isPlaying && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-[11px] font-bold tracking-wide text-white/90 backdrop-blur-sm">
            GIF
          </span>
        </div>
      )}

      {isPlaying && isBuffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/80" />
        </div>
      )}

      {timeLabel && (
        <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/40 px-1.5 text-[10px] font-medium text-white/90">
          {timeLabel}
        </span>
      )}
    </div>
  );
}
