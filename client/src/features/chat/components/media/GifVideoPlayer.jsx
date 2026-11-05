import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const GIF_MIME = /^(image|video)\/gif$/i;
const GIF_EXT = /\.(gif|gifv)(\?.*)?$/i;
const GIF_TOKEN = /(^|[._\-\s])gif([._\-\s]|$)/;

// Decides if a media item should play like a GIF (explicit flag, MIME, extension, or name hint)
export function isGifVideo(media, kind) {
  if (!media) return false;

  if (media.isGif === true || media.gifPlayback === true) return true;

  const mime = String(
    media.fileType || media.mimeType || media.mimetype || media.contentType || media.type || "",
  ).toLowerCase();
  if (GIF_MIME.test(mime)) return true;

  const name = String(
    media.fileName ||
      media.filename ||
      media.name ||
      media.url ||
      media.uri ||
      "",
  ).toLowerCase();
  if (GIF_EXT.test(name)) return true;

  // Videos only: "gif" as its own word in the name, or ending with .gif.mp4
  return (kind === "video" || mime.startsWith("video/")) && (GIF_TOKEN.test(name) || name.includes(".gif.mp4"));
}

// A chat "GIF" is a short silent looping MP4: first frame and a GIF badge, tap to play a few loops, tap again to replay
export function GifVideoPlayer({
  src,
  isLoading,
  error,
  timeLabel, // optional, shown bottom-right
  loopCount = 3, // plays this many times, then holds the last frame
  onError,
  className,
}) {
  const videoRef = useRef(null);
  const wraps = useRef(0); // times the native loop wrapped back to 0:00
  const lastTime = useRef(0);
  const finished = useRef(false); // true once stopped on the last frame
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [aspect, setAspect] = useState(null); // keeps the real ratio, no letterbox

  // Wire up video events and count loops
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let frameCallbackId = null;

    const handleMetadata = () => {
      if (v.videoWidth && v.videoHeight) {
        setAspect(v.videoWidth / v.videoHeight);
      }
      // Paints the first frame as the poster (needed on iOS Safari)
      if (v.currentTime === 0) v.currentTime = 0.001;
    };

    // Native loop does the looping; we only count wraps and turn loop off
    // for the final pass so the clip ends and holds its last frame
    const countWrap = (time) => {
      if (time < lastTime.current - 0.1 && !v.seeking) {
        wraps.current += 1;
        if (wraps.current >= loopCount - 1) v.loop = false;
      }
      lastTime.current = time;
    };

    const handleTimeUpdate = () => countWrap(v.currentTime);

    const handleFrame = (_now, meta) => {
      countWrap(meta.mediaTime);
      frameCallbackId = v.requestVideoFrameCallback(handleFrame);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      const canTrackFrames = typeof v.requestVideoFrameCallback === "function";
      if (canTrackFrames && frameCallbackId === null) {
        frameCallbackId = v.requestVideoFrameCallback(handleFrame);
      }
    };

    const handlePause = () => {
      if (!v.ended) setIsPlaying(false);
    };

    const handleEnded = () => {
      finished.current = true;
      setIsPlaying(false);
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = (e) => onErrorRef.current?.(e);

    v.addEventListener("loadedmetadata", handleMetadata);
    v.addEventListener("play", handlePlay);
    v.addEventListener("timeupdate", handleTimeUpdate);
    v.addEventListener("pause", handlePause);
    v.addEventListener("waiting", handleWaiting);
    v.addEventListener("playing", handlePlaying);
    v.addEventListener("ended", handleEnded);
    v.addEventListener("error", handleError);

    return () => {
      v.removeEventListener("loadedmetadata", handleMetadata);
      v.removeEventListener("play", handlePlay);
      v.removeEventListener("timeupdate", handleTimeUpdate);
      v.removeEventListener("pause", handlePause);
      v.removeEventListener("waiting", handleWaiting);
      v.removeEventListener("playing", handlePlaying);
      v.removeEventListener("ended", handleEnded);
      v.removeEventListener("error", handleError);
      if (frameCallbackId !== null && v.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(frameCallbackId);
      }
    };
  }, [src, loopCount]);

  // Pause when scrolled out of view so long chats don't keep decoding
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !v.paused) v.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(v);

    return () => observer.disconnect();
  }, [src]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;

    if (!v.paused) {
      v.pause();
      return;
    }

    if (finished.current || v.ended) {
      // Replay from the start with a fresh loop count
      finished.current = false;
      wraps.current = 0;
      lastTime.current = 0;
      v.loop = loopCount > 1;
      v.currentTime = 0;
    } else {
      // First play or resume: loop only while passes remain
      v.loop = wraps.current < loopCount - 1;
    }
    v.play().catch(() => {});
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
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
      onKeyDown={handleKeyDown}
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
        preload="auto" // GIFs are tiny, so load them to show the first frame
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        className="h-full w-full object-cover"
      />

      {/* GIF badge, only while stopped */}
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
