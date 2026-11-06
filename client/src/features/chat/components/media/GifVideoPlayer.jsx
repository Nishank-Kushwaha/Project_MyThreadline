import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const GIF_MIME = /^(image|video)\/gif$/i;
const GIF_EXT = /\.(gif|gifv)(\?.*)?$/i;
const GIF_TOKEN = /(^|[._\-\s])gif([._\-\s]|$)/;

// Decides if a media item should play like a GIF (explicit flag, MIME, extension, or name hint)
export function isGifVideo(media, kind) {
  if (!media) return false;

  // Explicit flag takes highest priority
  if (media.isGif === false || media.gifPlayback === false) return false;
  if (media.isGif === true || media.gifPlayback === true) return true;

  // MIME check for genuine raw gif formats
  const mime = String(
    media.fileType ||
      media.mimeType ||
      media.mimetype ||
      media.contentType ||
      media.type ||
      "",
  ).toLowerCase();
  if (GIF_MIME.test(mime)) return true;

  // Extension check for raw gif files
  const name = String(
    media.fileName ||
      media.filename ||
      media.name ||
      media.url ||
      media.uri ||
      "",
  ).toLowerCase();
  if (GIF_EXT.test(name)) return true;

  // Converted GIF video extension: must end with .gif.mp4
  return name.endsWith(".gif.mp4");
}

// Looping GIF video player with loop counter, scroll pause/resume, and thumbnail frame reset
export function GifVideoPlayer({
  src,
  isLoading,
  error,
  timeLabel,
  loopCount = 3,
  onError,
  className,
}) {
  const videoRef = useRef(null);
  const loopsPlayed = useRef(0);
  const finished = useRef(false);
  const wasPlayingBeforeScroll = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [aspect, setAspect] = useState(null);

  // Reset internal tracking refs whenever source changes
  useEffect(() => {
    loopsPlayed.current = 0;
    finished.current = false;
    wasPlayingBeforeScroll.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
  }, [src]);

  // Wire up video events and count loops cleanly via native ended event
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handleMetadata = () => {
      if (v.videoWidth && v.videoHeight) {
        setAspect(v.videoWidth / v.videoHeight);
      }
      // Paints the first frame as the poster thumbnail
      if (v.currentTime === 0) {
        try {
          v.currentTime = 0.001;
        } catch {}
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsBuffering(false);
      if (!v.ended) {
        setIsPlaying(false);
      }
    };

    const handleEnded = () => {
      loopsPlayed.current += 1;

      if (loopsPlayed.current < loopCount) {
        // Replay next loop
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        // Finished all loops: mark finished and reset back to first frame (thumbnail)
        finished.current = true;
        setIsPlaying(false);
        try {
          v.currentTime = 0.001;
        } catch {}
      }
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = (e) => onErrorRef.current?.(e);

    v.addEventListener("loadedmetadata", handleMetadata);
    v.addEventListener("play", handlePlay);
    v.addEventListener("pause", handlePause);
    v.addEventListener("ended", handleEnded);
    v.addEventListener("waiting", handleWaiting);
    v.addEventListener("playing", handlePlaying);
    v.addEventListener("error", handleError);

    return () => {
      v.removeEventListener("loadedmetadata", handleMetadata);
      v.removeEventListener("play", handlePlay);
      v.removeEventListener("pause", handlePause);
      v.removeEventListener("ended", handleEnded);
      v.removeEventListener("waiting", handleWaiting);
      v.removeEventListener("playing", handlePlaying);
      v.removeEventListener("error", handleError);
    };
  }, [src, loopCount]);

  // Pause when scrolled out of view and resume when scrolled back into view
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          if (!v.paused) {
            wasPlayingBeforeScroll.current = true;
            v.pause();
          }
        } else {
          // Scrolled back into view: resume only if it was playing and has passes remaining
          if (wasPlayingBeforeScroll.current && !finished.current) {
            wasPlayingBeforeScroll.current = false;
            v.play().catch(() => {});
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(v);

    return () => observer.disconnect();
  }, [src]);

  // Play / Pause toggle
  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;

    if (!v.paused) {
      wasPlayingBeforeScroll.current = false;
      v.pause();
      return;
    }

    if (finished.current || v.ended) {
      // Replay from start with a fresh loop count
      finished.current = false;
      loopsPlayed.current = 0;
      v.currentTime = 0;
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
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        className="h-full w-full object-cover"
      />

      {/* GIF badge shown when stopped */}
      {!isPlaying && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-[11px] font-bold tracking-wide text-white/90 backdrop-blur-sm">
            GIF
          </span>
        </div>
      )}

      {/* Buffering spinner */}
      {isPlaying && isBuffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/80" />
        </div>
      )}

      {/* Time label badge */}
      {timeLabel && (
        <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/40 px-1.5 text-[10px] font-medium text-white/90">
          {timeLabel}
        </span>
      )}
    </div>
  );
}
