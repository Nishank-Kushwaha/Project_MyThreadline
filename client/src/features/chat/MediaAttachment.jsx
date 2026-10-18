import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileAudio,
  FileVideo,
  File,
  Image as ImageIcon,
  Loader2,
  X,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { decryptMedia, formatFileSize } from "@/lib/e2ee/media";
import { cn } from "@/lib/utils";

// Lazy-load PdfViewer so pdfjs-dist is NOT bundled in the initial chunk
const PdfViewer = lazy(() =>
  import("./PdfViewer").then((m) => ({ default: m.PdfViewer })),
);

// ── File-type detection ────────────────────────────────────────────────────
// MIME types are frequently missing ("" from some OSes), generic
// ("application/octet-stream") or simply wrong (".ts" is often reported as
// "video/mp2t"). The filename extension is therefore consulted as well:
//   1. For text/code/PDF/archive/Office files the extension is authoritative.
//   2. Otherwise a specific image/audio/video MIME type is trusted.
//   3. Otherwise the extension is used, then the MIME type, then "unknown".

const EXTENSION_KINDS = {};
function register(kind, extensions) {
  for (const ext of extensions.split(" ")) EXTENSION_KINDS[ext] = kind;
}
register("image", "jpg jpeg png webp gif bmp svg");
register("pdf", "pdf");
register("text", "txt csv json md markdown log xml yaml yml");
register(
  "code",
  "js jsx mjs cjs ts tsx html htm css py c h cpp cc cxx hpp java sql",
);
register("archive", "zip rar 7z tar gz tgz");
register("office", "doc docx xls xlsx ppt pptx");
register("audio", "mp3 wav ogg oga m4a aac flac opus weba");
register("video", "mp4 m4v webm mov mkv avi ogv");

// Kinds whose extension beats whatever MIME type the file claims.
const EXTENSION_WINS = new Set(["pdf", "text", "code", "archive", "office"]);

// Used to ask the browser "can you play this?" when the MIME type is missing.
const EXTENSION_MEDIA_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/ogg; codecs=opus",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
};

const ARCHIVE_MIMES = new Set([
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/x-gtar",
  "application/gzip",
  "application/x-gzip",
  "application/x-tgz",
  "application/x-compressed",
]);

const CODE_MIME_RE =
  /^(?:text\/(?:html|css|javascript|typescript|x-(?:c|csrc|chdr|c\+\+|c\+\+src|java|java-source|python|sql))|application\/(?:x-)?(?:javascript|typescript|sql))$/;

const OFFICE_MIME_RE =
  /(msword|ms-excel|ms-powerpoint|wordprocessingml|spreadsheetml|presentationml)/;

const NOUN_BY_KIND = {
  image: "image",
  pdf: "document",
  text: "text file",
  code: "source file",
  archive: "archive",
  office: "document",
  audio: "audio",
  video: "video",
  unknown: "file",
};

function normalizeMime(fileType) {
  return String(fileType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function getExtension(fileName) {
  const base = String(fileName || "")
    .split(/[\\/]/)
    .pop()
    .trim();
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1
    ? base.slice(dot + 1).toLowerCase()
    : "";
}

function kindFromMime(mime) {
  if (!mime) return null;
  if (mime === "application/pdf" || mime === "application/x-pdf") return "pdf";
  if (OFFICE_MIME_RE.test(mime)) return "office";
  if (ARCHIVE_MIMES.has(mime)) return "archive";
  if (CODE_MIME_RE.test(mime)) return "code";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  )
    return "text";
  return null;
}

/**
 * @returns {{ kind: string, ext: string, mime: string, label: string }}
 * kind: image | pdf | text | code | archive | office | audio | video | unknown
 */
function classifyAttachment(fileType, fileName) {
  const mime = normalizeMime(fileType);
  const ext = getExtension(fileName);
  const extKind = EXTENSION_KINDS[ext];

  let kind;
  if (extKind && EXTENSION_WINS.has(extKind)) kind = extKind;
  else if (mime.startsWith("image/")) kind = "image";
  else if (mime.startsWith("audio/")) kind = "audio";
  else if (mime.startsWith("video/")) kind = "video";
  else if (extKind) kind = extKind;
  else kind = kindFromMime(mime) || "unknown";

  const noun = NOUN_BY_KIND[kind];
  const label =
    ext && ext.length <= 5 && kind !== "unknown"
      ? `${ext.toUpperCase()} ${noun}`
      : ext && ext.length <= 5
        ? `${ext.toUpperCase()} file`
        : noun.charAt(0).toUpperCase() + noun.slice(1);

  return { kind, ext, mime, label };
}

function getFileIcon(fileType = "", fileName = "") {
  const { kind, ext } = classifyAttachment(fileType, fileName);
  switch (kind) {
    case "image":
      return ImageIcon;
    case "pdf":
      return FileText;
    case "archive":
      return FileArchive;
    case "code":
      return FileCode;
    case "text":
      if (ext === "csv") return FileSpreadsheet;
      if (["json", "xml", "yaml", "yml"].includes(ext)) return FileCode;
      return FileText;
    case "office":
      return ext === "xls" || ext === "xlsx" ? FileSpreadsheet : FileText;
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    default:
      return File;
  }
}

/** Ask the browser whether it can play this audio/video format. */
function canBrowserPlay(kind, mime) {
  if (typeof document === "undefined" || !mime) return false;
  try {
    const el = document.createElement(kind);
    return typeof el.canPlayType === "function" && el.canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

// ── Text preview (rendered as TEXT, never as HTML) ─────────────────────────
// The old preview pointed an <iframe> at the blob/remote URL. A blob: URL
// inherits the app's origin, so an uploaded .html/.svg/.xml could run script
// with access to the app (and its E2EE keys). We now fetch the bytes, decode
// them, and render them through React as a string inside <pre>.

const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

async function readTextPreview(url, signal) {
  const res = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const chunks = [];
  let received = 0;
  let truncated = false;

  if (res.body?.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = TEXT_PREVIEW_MAX_BYTES - received;
      if (value.length > room) {
        chunks.push(value.subarray(0, room));
        received += room;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      received += value.length;
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    truncated = all.length > TEXT_PREVIEW_MAX_BYTES;
    chunks.push(all.subarray(0, TEXT_PREVIEW_MAX_BYTES));
    received = chunks[0].length;
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";

  // NUL bytes in UTF-8/ASCII content mean this is binary, not text.
  if (encoding === "utf-8" && bytes.subarray(0, 8192).includes(0)) {
    const err = new Error("Binary content");
    err.code = "binary";
    throw err;
  }

  return { text: new TextDecoder(encoding).decode(bytes), truncated };
}

// ── Download ───────────────────────────────────────────────────────────────
// Browsers ignore the `download` attribute on cross-origin URLs (e.g. a
// Cloudinary URL), which would save the file under the CDN's name or just
// navigate away. For remote URLs we fetch → save as a blob with the original
// filename, and fall back to opening the URL in a new tab if that fails
// (e.g. CORS). Decrypted blob: URLs use the native download behaviour.

async function saveRemoteFile(href, fileName) {
  const res = await fetch(href, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

function DownloadLink({
  href,
  fileName,
  className,
  title = "Save as…",
  stopPropagation = false,
  children,
}) {
  const [busy, setBusy] = useState(false);
  const isLocal = href.startsWith("blob:") || href.startsWith("data:");

  const handleClick = async (e) => {
    if (stopPropagation) e.stopPropagation();
    if (isLocal) return; // native download works for blob: URLs
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await saveRemoteFile(href, fileName);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={href}
      download={fileName}
      {...(isLocal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      onClick={handleClick}
      title={title}
      aria-busy={busy}
      className={cn(className, busy && "pointer-events-none opacity-60")}
    >
      {children}
    </a>
  );
}

// ── Audio & Video Helpers ──────────────────────────────────────────────────

function formatMediaTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) {
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// WhatsApp-style sleek interactive Audio Player with scrubbable waveform/progress
function CustomAudioPlayer({ src, fileName, metaLine, isOwn, onError }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
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

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    if (onError) audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
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
        {/* Circular Play / Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-md transition-all active:scale-95",
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
        </button>

        {/* Waveform & Scrubber */}
        <div className="relative flex-1 flex flex-col justify-center min-w-0 py-1">
          {/* Visual audio waveform bars */}
          <div className="flex items-center gap-[2.5px] sm:gap-[3px] h-7 w-full overflow-hidden px-0.5">
            {barHeights.map((h, i) => {
              const barPercent = (i / (barHeights.length - 1)) * 100;
              const isPassed = barPercent <= progressPercent;
              return (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={cn(
                    "flex-1 rounded-full transition-colors duration-150 min-w-[2px]",
                    isPassed
                      ? isOwn
                        ? "bg-primary dark:bg-primary"
                        : "bg-primary"
                      : isOwn
                        ? "bg-foreground/20 dark:bg-white/20"
                        : "bg-foreground/20 dark:bg-white/20",
                  )}
                />
              );
            })}
          </div>

          {/* Invisible interactive range input overlaid on waveform */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step="0.05"
            value={currentTime}
            onMouseDown={() => setIsSeeking(true)}
            onTouchStart={() => setIsSeeking(true)}
            onChange={handleSeek}
            onMouseUp={() => setIsSeeking(false)}
            onTouchEnd={() => setIsSeeking(false)}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// WhatsApp-style modern Video Card with overlay controls and thumbnail view
function CustomVideoPlayer({ src, fileName, isOwn, onOpenFullscreen, onError }) {
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

      {/* Bottom overlay player bar (fades on hover or always visible when playing) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-6 transition-opacity duration-200",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 hover:opacity-100",
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

// ── Component ──────────────────────────────────────────────────────────────

export function MediaAttachment({ media, isOwn }) {
  const [decryptedUrl, setDecryptedUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Set when <img>/<audio>/<video> can't actually render the file.
  const [previewBroken, setPreviewBroken] = useState(false);
  const [textPreview, setTextPreview] = useState({
    status: "idle", // idle | loading | ready | binary | error
    text: "",
    truncated: false,
  });

  const hasKey = Boolean(media?.key);
  const hasIv = Boolean(media?.iv);
  const isEncrypted = hasKey && hasIv;
  const hasPartialKeys = hasKey !== hasIv; // never show ciphertext as if it were the file

  const info = useMemo(
    () => classifyAttachment(media?.fileType, media?.fileName),
    [media?.fileType, media?.fileName],
  );
  const isTextual = info.kind === "text" || info.kind === "code";

  const playMime = info.mime.startsWith(`${info.kind}/`)
    ? info.mime
    : EXTENSION_MEDIA_MIME[info.ext];
  const canPlay = useMemo(
    () =>
      (info.kind === "audio" || info.kind === "video") &&
      canBrowserPlay(info.kind, playMime),
    [info.kind, playMime],
  );

  // Which presentation to use: image | pdf | media | generic
  let view = "generic";
  if (info.kind === "pdf") view = "pdf";
  else if (info.kind === "image" && !previewBroken) view = "image";
  else if (
    (info.kind === "audio" || info.kind === "video") &&
    canPlay &&
    !previewBroken
  )
    view = "media";

  const sourceUrl = hasPartialKeys
    ? null
    : isEncrypted
      ? decryptedUrl
      : media?.url;
  const displayError = hasPartialKeys
    ? "Missing decryption information for this attachment"
    : error;

  // ── Decrypt / load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPreviewBroken(false);
    setError(null);
    setDecryptedUrl(null);

    if (!media?.url || !isEncrypted) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    decryptMedia({
      url: media.url,
      key: media.key,
      iv: media.iv,
      fileType: media.fileType,
      fileName: media.fileName,
    })
      .then((url) => {
        if (cancelled) return;
        if (!url) throw new Error("decryptMedia returned no URL");
        setDecryptedUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to decrypt media attachment:", err);
          setError("Failed to decrypt media");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    media?.url,
    media?.key,
    media?.iv,
    media?.fileType,
    media?.fileName,
    isEncrypted,
  ]);

  // ── Load text/code content when the preview modal opens ───────────────
  useEffect(() => {
    if (!isModalOpen || !sourceUrl || !isTextual) return;
    const controller = new AbortController();
    setTextPreview({ status: "loading", text: "", truncated: false });

    readTextPreview(sourceUrl, controller.signal)
      .then(({ text, truncated }) =>
        setTextPreview({ status: "ready", text, truncated }),
      )
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTextPreview({
          status: err?.code === "binary" ? "binary" : "error",
          text: "",
          truncated: false,
        });
      });

    return () => controller.abort();
  }, [isModalOpen, sourceUrl, isTextual]);

  // ── Escape to close non-PDF modals ────────────────────────────────────
  useEffect(() => {
    if (!isModalOpen || view === "pdf") return; // PdfViewer handles its own escape
    const onKey = (e) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen, view]);

  if (!media) return null;

  const FileIcon = getFileIcon(media.fileType, media.fileName);
  const displayName =
    media.fileName || (view === "pdf" ? "Document.pdf" : "Attachment");
  const downloadName =
    media.fileName || (view === "pdf" ? "document.pdf" : "attachment");
  const sizeText = media.fileSize ? formatFileSize(media.fileSize) : "";
  const metaLine = [info.label, sizeText].filter(Boolean).join(" · ");

  const cardTone = isOwn
    ? "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
    : "border-border bg-background/60";

  // ── No URL at all ─────────────────────────────────────────────────────
  if (!media.url) {
    return (
      <div
        className={cn(
          "mb-1.5 flex items-center gap-3 rounded-xl border p-2.5",
          cardTone,
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {displayName}
          </p>
          <p className="text-[10px] text-destructive">Attachment unavailable</p>
        </div>
      </div>
    );
  }

  // ── Full-screen modal for images, videos, and text/code ───────────────
  const renderPreviewModal = () => {
    if (!isModalOpen || !sourceUrl || view === "pdf") return null;
    const isVideoView = view === "media" && info.kind === "video";
    if (!(view === "image" || isTextual || isVideoView)) return null;

    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={displayName}
        className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
        onClick={() => setIsModalOpen(false)}
      >
        {/* Top header */}
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-900/95 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <FileIcon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold leading-tight text-white">
                {media.fileName || "Document"}
              </h2>
              <p className="text-[11px] leading-tight text-white/50">
                {sizeText}
                {isEncrypted ? `${sizeText ? " · " : ""}🔒 E2E encrypted` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 pl-3">
            <DownloadLink
              href={sourceUrl}
              fileName={downloadName}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </DownloadLink>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              title="Close (Esc)"
              aria-label="Close preview"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Viewer body */}
        <div
          className="flex flex-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideoView ? (
            <div className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4 bg-black/90">
              <video
                src={sourceUrl}
                controls
                autoPlay
                playsInline
                className="h-full w-full max-h-[88vh] max-w-[94vw] rounded-xl object-contain shadow-2xl"
              />
            </div>
          ) : view === "image" ? (
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              {/* <img> never executes scripts, even for SVG. */}
              <img
                src={sourceUrl}
                alt={media.fileName || "Preview"}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden p-2">
              <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950">
                {textPreview.status === "loading" ||
                textPreview.status === "idle" ? (
                  <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading preview…
                  </div>
                ) : textPreview.status === "ready" ? (
                  <>
                    <pre
                      tabIndex={0}
                      className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-5 text-white/90 focus:outline-none"
                    >
                      {textPreview.text}
                    </pre>
                    {textPreview.truncated && (
                      <p className="shrink-0 border-t border-white/10 bg-neutral-900 px-4 py-2 text-[11px] text-white/60">
                        Preview shows the first{" "}
                        {formatFileSize(TEXT_PREVIEW_MAX_BYTES)}. Save the file
                        to read the rest.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                      <FileIcon className="h-8 w-8 text-white/80" />
                    </div>
                    <p className="text-sm text-white/60">
                      {textPreview.status === "binary"
                        ? "This file doesn't contain readable text."
                        : "The preview couldn't be loaded."}
                    </p>
                    <DownloadLink
                      href={sourceUrl}
                      fileName={downloadName}
                      className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90"
                    >
                      <Download className="h-4 w-4" />
                      Save as…
                    </DownloadLink>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // IMAGE ATTACHMENT — inline thumbnail + zoom modal
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "image") {
    return (
      <div className="mb-1.5 overflow-hidden rounded-xl">
        {isLoading ? (
          <div className="flex h-48 w-64 max-w-full items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
            <div className="flex flex-col items-center gap-2 text-xs opacity-70">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Decrypting image…</span>
            </div>
          </div>
        ) : displayError ? (
          <div className="flex h-32 w-60 items-center justify-center rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            {displayError}
          </div>
        ) : (
          sourceUrl && (
            <>
              <div
                onClick={() => setIsModalOpen(true)}
                className="group/img relative max-w-sm cursor-pointer overflow-hidden rounded-lg"
              >
                <img
                  src={sourceUrl}
                  alt={media.fileName || "Shared image"}
                  className="max-h-72 w-auto max-w-full rounded-lg object-contain transition-opacity hover:opacity-95"
                  loading="lazy"
                  onError={() => {
                    setIsModalOpen(false);
                    setPreviewBroken(true);
                  }}
                />
                <DownloadLink
                  href={sourceUrl}
                  fileName={downloadName}
                  stopPropagation
                  className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-md transition-opacity hover:bg-black/80 group-hover/img:opacity-100"
                >
                  <Download className="h-3.5 w-3.5" />
                </DownloadLink>
              </div>
              {renderPreviewModal()}
            </>
          )
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PDF ATTACHMENT — WhatsApp-style bubble card
  // PdfViewer owns its own full-screen modal (no wrapper needed here)
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "pdf") {
    return (
      <>
        <div
          className={cn("mb-1.5 overflow-hidden rounded-xl border", cardTone)}
        >
          {/* PDF card top row: icon + name + size */}
          <div className="flex items-center gap-3 px-3 pb-2 pt-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-sm">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-snug text-foreground">
                {displayName}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {media.pageCount ? `${media.pageCount} pages · ` : ""}PDF
                {sizeText ? ` · ${sizeText}` : ""}
              </p>
            </div>
          </div>

          {/* Error */}
          {displayError && (
            <div className="flex items-center gap-1.5 px-3 pb-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Action buttons: View | Save as… */}
          <div
            className={cn(
              "flex border-t",
              isOwn ? "border-black/10 dark:border-white/10" : "border-border",
            )}
          >
            {/* View */}
            <button
              type="button"
              onClick={() => {
                if (sourceUrl && !isLoading) setIsModalOpen(true);
              }}
              disabled={isLoading || !sourceUrl}
              className={cn(
                "flex flex-1 items-center justify-center border-r py-2 text-sm font-semibold transition",
                isOwn
                  ? "border-black/10 text-foreground hover:bg-black/10 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                  : "border-border text-primary hover:bg-primary/8",
                (isLoading || !sourceUrl) && "cursor-not-allowed opacity-50",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "View"
              )}
            </button>

            {/* Save as… */}
            {sourceUrl && !isLoading ? (
              <DownloadLink
                href={sourceUrl}
                fileName={downloadName}
                className={cn(
                  "flex flex-1 items-center justify-center py-2 text-sm font-semibold transition",
                  isOwn
                    ? "text-foreground hover:bg-black/10 dark:text-white dark:hover:bg-white/10"
                    : "text-primary hover:bg-primary/8",
                )}
              >
                Save as…
              </DownloadLink>
            ) : (
              <span className="flex flex-1 cursor-not-allowed items-center justify-center py-2 text-sm font-semibold opacity-40">
                Save as…
              </span>
            )}
          </div>
        </div>

        {/* PdfViewer owns its entire full-screen modal */}
        {isModalOpen && sourceUrl && (
          <Suspense fallback={null /* modal not shown until chunk loads */}>
            <PdfViewer
              blobUrl={sourceUrl}
              fileName={media.fileName}
              fileSize={media.fileSize}
              isEncrypted={isEncrypted}
              onClose={() => setIsModalOpen(false)}
            />
          </Suspense>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIO / VIDEO — modern custom responsive players
  // A failing player drops back to the generic card below via previewBroken.
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "media") {
    const onPlayerError = () => setPreviewBroken(true);
    return (
      <>
        <div
          className={cn(
            "mb-1.5 w-full max-w-[280px] sm:max-w-xs md:max-w-sm overflow-hidden rounded-2xl border shadow-sm transition-all",
            cardTone,
          )}
        >
          {isLoading ? (
            <div className="flex h-24 items-center justify-center gap-2.5 text-xs text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Decrypting {info.kind}…</span>
            </div>
          ) : displayError ? (
            <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          ) : (
            sourceUrl &&
            (info.kind === "video" ? (
              <CustomVideoPlayer
                src={sourceUrl}
                fileName={displayName}
                isOwn={isOwn}
                onOpenFullscreen={() => setIsModalOpen(true)}
                onError={onPlayerError}
              />
            ) : (
              <CustomAudioPlayer
                src={sourceUrl}
                fileName={displayName}
                metaLine={metaLine}
                isOwn={isOwn}
                onError={onPlayerError}
              />
            ))
          )}

          {/* Bottom metadata and download row */}
          <div className="flex items-center justify-between gap-2.5 border-t border-black/5 dark:border-white/10 px-3 py-2 bg-black/[0.02] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  info.kind === "video"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {info.kind === "video" ? (
                  <FileVideo className="h-3.5 w-3.5" />
                ) : (
                  <FileAudio className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold leading-tight text-foreground">
                  {displayName}
                </p>
                <p className="truncate text-[10px] leading-tight text-muted-foreground">
                  {metaLine}
                </p>
              </div>
            </div>

            {sourceUrl && !isLoading && !displayError && (
              <DownloadLink
                href={sourceUrl}
                fileName={downloadName}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:scale-105 hover:bg-muted active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
              </DownloadLink>
            )}
          </div>
        </div>

        {/* Video Fullscreen Preview Modal */}
        {renderPreviewModal()}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERIC FILE ATTACHMENT CARD
  // Archives, Office docs, unplayable audio/video, unknown types, failed
  // image previews — plus text/code, which additionally opens the text modal.
  // ══════════════════════════════════════════════════════════════════════════
  const previewable =
    isTextual && Boolean(sourceUrl) && !isLoading && !displayError;
  const openPreview = () => {
    if (previewable) setIsModalOpen(true);
  };

  return (
    <>
      <div
        onClick={previewable ? openPreview : undefined}
        role={previewable ? "button" : undefined}
        tabIndex={previewable ? 0 : undefined}
        onKeyDown={
          previewable
            ? (e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openPreview();
                }
              }
            : undefined
        }
        className={cn(
          "group/doc mb-1.5 flex items-center gap-3 rounded-xl border p-2.5 transition-all",
          isOwn
            ? "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
            : "border-border bg-background/60",
          previewable &&
            (isOwn
              ? "cursor-pointer select-none hover:bg-black/10 dark:hover:bg-white/10"
              : "cursor-pointer select-none hover:bg-muted/80"),
          isLoading && "cursor-wait opacity-80",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform",
            displayError
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
            previewable && "group-hover/doc:scale-105",
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : displayError ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <FileIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-xs font-medium text-foreground transition-colors",
              previewable && "group-hover/doc:text-primary",
            )}
          >
            {displayName}
          </p>
          {displayError ? (
            <p className="text-[10px] text-destructive">{displayError}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{metaLine}</p>
          )}
        </div>
        {sourceUrl && !isLoading && !displayError && (
          <DownloadLink
            href={sourceUrl}
            fileName={downloadName}
            stopPropagation
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:scale-105 hover:bg-muted active:scale-95"
          >
            <Download className="h-4 w-4" />
          </DownloadLink>
        )}
      </div>

      {renderPreviewModal()}
    </>
  );
}
