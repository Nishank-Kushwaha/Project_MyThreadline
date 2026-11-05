import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

// Total GIF length in ms, summed from the frame delays in its Graphic Control Extension blocks
async function readGifDuration(src, signal) {
  const res = await fetch(src, { signal, credentials: "omit" });
  const buf = new Uint8Array(await res.arrayBuffer());
  let total = 0;

  for (let i = 0; i < buf.length - 7; i++) {
    // Block layout: 0x21 0xF9 0x04 <flags> <delay lo> <delay hi> <transparent idx> 0x00
    const isFrameBlock =
      buf[i] === 0x21 &&
      buf[i + 1] === 0xf9 &&
      buf[i + 2] === 0x04 &&
      buf[i + 7] === 0x00;
    if (!isFrameBlock) continue;

    let delay = buf[i + 4] | (buf[i + 5] << 8); // in 1/100 s
    if (delay < 2) delay = 10; // browsers treat tiny delays as 100ms
    total += delay * 10;
    i += 7;
  }
  return total;
}

// Still first frame with a GIF badge; tap to play a few loops, then it stops again
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
  const [playId, setPlayId] = useState(0); // remounts the <img> so it restarts from frame 1
  const [aspect, setAspect] = useState(null);

  // Paint the first frame to the canvas and read the total duration
  useEffect(() => {
    if (!src || isLoading || error) return;

    const controller = new AbortController();
    const img = new Image();

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
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
    const oneLoop = durationRef.current || 3000;
    timerRef.current = setTimeout(stop, oneLoop * loopCount);
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
      aria-label={playing ? "Stop GIF" : "Play GIF"}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      style={aspect ? { aspectRatio: String(aspect) } : undefined}
      className={cn(
        "relative max-h-72 min-h-24 w-auto max-w-[16rem] cursor-pointer select-none overflow-hidden rounded-lg bg-black",
        "focus-visible:outline focus-visible:outline-primary",
        className,
      )}
    >
      {/* Still first frame, always underneath */}
      <canvas ref={canvasRef} className="h-full w-full object-cover" />

      {/* Animated GIF, only while playing */}
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
