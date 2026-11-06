import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMediaTime } from "@/features/chat/lib/mediaUtils";

// WhatsApp-style modern video card with overlay controls and thumbnail view
export function CustomVideoPlayer({ src, onOpenFullscreen, onError }) {
  const videoRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    if (onError) video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      if (onError) video.removeEventListener("error", onError);
    };
  }, [onError]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.pause();
    else video.play().catch(() => {});
  };

  const toggleMute = (e) => {
    e?.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="group/video relative w-full overflow-hidden bg-black aspect-video max-h-80 flex items-center justify-center cursor-pointer select-none"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
      />

      {/* Floating Center Play Button when paused */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px] transition-all">
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play video"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition hover:scale-110 active:scale-95"
          >
            <Play className="h-7 w-7 fill-current ml-1" />
          </button>
        </div>
      )}

      {/* Top badge: duration chip */}
      <div className="absolute top-2.5 left-2.5 pointer-events-none">
        <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[11px] font-medium text-white/90 backdrop-blur-md shadow">
          {formatMediaTime(duration || currentTime)}
        </span>
      </div>

      {/* Bottom overlay player bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 inset-x-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-6 transition-opacity duration-200",
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 hover:opacity-100",
        )}
      >
        {/* Progress track */}
        <div className="relative mb-2 flex items-center">
          <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full bg-primary rounded-full transition-all duration-100"
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setCurrentTime(val);
              if (videoRef.current) videoRef.current.currentTime = val;
            }}
            aria-label="Seek video"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Bottom controls row */}
        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1 text-white/90 hover:text-white transition"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-1 text-white/90 hover:text-white transition"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <span className="font-mono text-[11px] text-white/80">
              {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenFullscreen}
            className="p-1 text-white/90 hover:text-white transition"
            title="Expand to Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
