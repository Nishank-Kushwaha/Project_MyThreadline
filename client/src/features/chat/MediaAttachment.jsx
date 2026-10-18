import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
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

  // ── Full-screen modal for images and text/code ────────────────────────
  const renderPreviewModal = () => {
    if (!isModalOpen || !sourceUrl || view === "pdf" || view === "media")
      return null;
    if (!(view === "image" || isTextual)) return null;

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
          {view === "image" ? (
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
  // AUDIO / VIDEO — inline player (only when the browser says it can play it)
  // A failing player drops back to the generic card below via previewBroken.
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "media") {
    const onPlayerError = () => setPreviewBroken(true);
    return (
      <div
        className={cn(
          "mb-1.5 max-w-sm overflow-hidden rounded-xl border",
          cardTone,
        )}
      >
        {isLoading ? (
          <div className="flex h-20 items-center justify-center gap-2 text-xs opacity-70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Decrypting {info.kind}…</span>
          </div>
        ) : displayError ? null : (
          sourceUrl &&
          (info.kind === "video" ? (
            <video
              src={sourceUrl}
              controls
              playsInline
              preload="metadata"
              onError={onPlayerError}
              className="max-h-72 w-full bg-black"
            />
          ) : (
            <div className="px-2 pt-2">
              <audio
                src={sourceUrl}
                controls
                preload="metadata"
                onError={onPlayerError}
                className="w-full"
              />
            </div>
          ))
        )}

        <div className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {displayName}
            </p>
            {displayError ? (
              <p className="flex items-center gap-1 text-[10px] text-destructive">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {displayError}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">{metaLine}</p>
            )}
          </div>
          {sourceUrl && !isLoading && !displayError && (
            <DownloadLink
              href={sourceUrl}
              fileName={downloadName}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:scale-105 hover:bg-muted active:scale-95"
            >
              <Download className="h-4 w-4" />
            </DownloadLink>
          )}
        </div>
      </div>
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
