import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Sum of frame delays (ms), read from the GIF's Graphic Control Extension blocks.
async function readGifDuration(src, signal) {
  const res = await fetch(src, { signal, credentials: "omit" });
  const buf = new Uint8Array(await res.arrayBuffer());
  let total = 0;
  for (let i = 0; i < buf.length - 7; i++) {
    // 0x21 0xF9 0x04 <flags> <delay lo> <delay hi> <transparent idx> 0x00
    if (
      buf[i] === 0x21 &&
      buf[i + 1] === 0xf9 &&
      buf[i + 2] === 0x04 &&
      buf[i + 7] === 0x00
    ) {
      let delay = buf[i + 4] | (buf[i + 5] << 8); // 1/100 s
      if (delay < 2) delay = 10; // browsers treat tiny delays as 100ms
      total += delay * 10;
      i += 7;
    }
  }
  return total;
}

export function GifImagePlayer({
  src,
  isLoading,
  error,
  timeLabel,
  loopCount = 3,
  onError,
  className,
}) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const durationRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [playing, setPlaying] = useState(false);
  const [playId, setPlayId] = useState(0); // remount <img> => restarts from frame 1
  const [aspect, setAspect] = useState(null);

  // Paint first frame to canvas + read total duration
  useEffect(() => {
    if (!src || isLoading || error) return;
    const controller = new AbortController();
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      setAspect(img.naturalWidth / img.naturalHeight);
    };
    img.onerror = () => onErrorRef.current?.();
    img.src = src;

    readGifDuration(src, controller.signal)
      .then((ms) => (durationRef.current = ms))
      .catch(() => {});

    return () => {
      controller.abort();
      clearTimeout(timerRef.current);
      setPlaying(false);
    };
  }, [src, isLoading, error]);

  const stop = () => {
    clearTimeout(timerRef.current);
    setPlaying(false);
  };

  const toggle = () => {
    if (playing) return stop();
    setPlayId((n) => n + 1);
    setPlaying(true);
    const once = durationRef.current || 3000;
    timerRef.current = setTimeout(stop, once * loopCount);
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
      aria-label={playing ? "Stop GIF" : "Play GIF"}
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
      {/* Still first frame (always underneath) */}
      <canvas ref={canvasRef} className="h-full w-full object-cover" />

      {/* Animated GIF only while playing */}
      {playing && (
        <img
          key={playId}
          src={src}
          alt="GIF"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-[11px] font-bold tracking-wide text-white/90 backdrop-blur-sm">
            GIF
          </span>
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
