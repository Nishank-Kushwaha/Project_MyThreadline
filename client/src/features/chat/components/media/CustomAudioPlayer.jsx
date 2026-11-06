import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Download,
  Mic,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DownloadLink } from "./DownloadLink";
import { formatMediaTime } from "@/features/chat/lib/mediaUtils";

// WhatsApp-style sleek audio player with scrubbable waveform and speed controls
export function CustomAudioPlayer({
  src,
  isOwn,
  isVoiceNote = false,
  fallbackDuration = 0,
  downloadName,
  onError,
}) {
  const audioRef = useRef(null);
  const waveformWrapRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPercent, setHoverPercent] = useState(0);

  // Sync fallback duration if duration was initially unmeasured
  useEffect(() => {
    if (fallbackDuration && (!duration || !isFinite(duration))) {
      setDuration(fallbackDuration);
    }
  }, [fallbackDuration]);

  // Wire up audio element events and fix chromium Infinity duration bug
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let fixing = false;
    const handleLoadedMetadata = () => {
      if (audio.duration === Infinity && !fixing) {
        fixing = true;
        const reset = () => {
          audio.removeEventListener("timeupdate", reset);
          audio.currentTime = 0;
          fixing = false;
        };
        audio.addEventListener("timeupdate", reset);
        audio.currentTime = 1e101;
      } else if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) setCurrentTime(audio.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleLoadedMetadata);
    if (onError) audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleLoadedMetadata);
      if (onError) audio.removeEventListener("error", onError);
    };
  }, [isSeeking, onError]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const updateSeekPosition = (clientX) => {
    if (!duration || !waveformWrapRef.current) return;
    const rect = waveformWrapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    const timeAtCursor = (percent / 100) * duration;
    setHoverPercent(percent);
    setHoverTime(timeAtCursor);
    return timeAtCursor;
  };

  const handleWaveformMouseMove = (e) => {
    updateSeekPosition(e.clientX);
  };

  const handleWaveformMouseLeave = () => {
    if (!isSeeking) {
      setHoverTime(null);
    }
  };

  const handleTouchStartSeek = (e) => {
    e.stopPropagation();
    setIsSeeking(true);
    if (e.touches?.[0]) {
      const newTime = updateSeekPosition(e.touches[0].clientX);
      if (newTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  };

  const handleTouchMoveSeek = (e) => {
    e.stopPropagation();
    if (e.touches?.[0]) {
      const newTime = updateSeekPosition(e.touches[0].clientX);
      if (newTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  };

  const handleTouchEndSeek = (e) => {
    e.stopPropagation();
    setIsSeeking(false);
    setHoverTime(null);
  };

  const toggleSpeed = () => {
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 24 mock waveform bars with dynamic heights for WhatsApp voice-note look
  const barHeights = useMemo(
    () => [
      28, 45, 60, 35, 80, 50, 95, 70, 40, 85, 100, 65, 45, 75, 90, 55, 30, 85,
      60, 40, 70, 50, 35, 20,
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-2 p-3 sm:p-3.5 select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Main player controls row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          className={cn(
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-md transition-all active:scale-95",
            isOwn
              ? "bg-primary text-primary-foreground hover:brightness-110"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-0.5" />
          )}

          {isVoiceNote && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border text-primary shadow-xs"
              title="Voice message"
            >
              <Mic className="h-2.5 w-2.5" />
            </span>
          )}
        </button>

        {/* Waveform & Scrubber */}
        <div
          ref={waveformWrapRef}
          onMouseMove={handleWaveformMouseMove}
          onMouseLeave={handleWaveformMouseLeave}
          onTouchStart={handleTouchStartSeek}
          onTouchMove={handleTouchMoveSeek}
          onTouchEnd={handleTouchEndSeek}
          className="relative flex-1 flex flex-col justify-center min-w-0 py-1 touch-none"
        >
          {/* Floating Seek Timestamp Tooltip */}
          {hoverTime !== null && duration > 0 && (
            <div
              style={{ left: `${hoverPercent}%` }}
              className="absolute -top-7 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center animate-in fade-in zoom-in-90 duration-150"
            >
              <span className="rounded-md bg-neutral-900 border border-white/20 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-xl whitespace-nowrap">
                {formatMediaTime(hoverTime)}
              </span>
              <div className="h-1.5 w-1.5 rotate-45 bg-neutral-900 border-r border-b border-white/20 -mt-1" />
            </div>
          )}

          {/* Visual audio waveform bars */}
          <div className="flex items-center gap-[2.5px] sm:gap-0.75 h-7 w-full overflow-hidden px-0.5">
            {barHeights.map((h, i) => {
              const barPercent = (i / (barHeights.length - 1)) * 100;
              const isPassed = barPercent <= progressPercent;
              const isHovered =
                hoverTime !== null && barPercent <= hoverPercent;
              return (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={cn(
                    "flex-1 rounded-full transition-colors duration-150 min-w-0.5",
                    isPassed
                      ? isOwn
                        ? "bg-primary dark:bg-primary"
                        : "bg-primary"
                      : isHovered
                        ? isOwn
                          ? "bg-primary/50 dark:bg-primary/60"
                          : "bg-primary/50"
                        : isOwn
                          ? "bg-foreground/20 dark:bg-white/20"
                          : "bg-foreground/20 dark:bg-white/20",
                  )}
                />
              );
            })}
          </div>

          {/* Interactive range input overlaid on waveform */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step="0.05"
            value={currentTime}
            onMouseDown={() => setIsSeeking(true)}
            onTouchStart={() => setIsSeeking(true)}
            onChange={handleSeek}
            onMouseUp={() => {
              setIsSeeking(false);
              setHoverTime(null);
            }}
            onTouchEnd={() => {
              setIsSeeking(false);
              setHoverTime(null);
            }}
            aria-label="Seek audio"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          {/* Time & speed controls sub-row */}
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mt-1">
            <span>
              {formatMediaTime(currentTime)}{" "}
              <span className="opacity-40">/</span>{" "}
              {duration ? formatMediaTime(duration) : "--:--"}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSpeed}
                title="Change playback speed"
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-foreground/10 hover:bg-foreground/20 text-foreground transition active:scale-95"
              >
                {playbackRate}x
              </button>
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
                className="opacity-70 hover:opacity-100 transition p-0.5"
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
              {isVoiceNote && src && (
                <DownloadLink
                  href={src}
                  fileName={downloadName || "voice-message.weba"}
                  className="opacity-70 hover:opacity-100 transition p-0.5 text-foreground hover:text-primary"
                  title="Download voice note"
                >
                  <Download className="h-3.5 w-3.5" />
                </DownloadLink>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
