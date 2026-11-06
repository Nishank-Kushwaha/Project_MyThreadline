import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { formatFileSize } from "@/features/e2ee/lib/media";
import { DownloadLink } from "./DownloadLink";
import { TEXT_PREVIEW_MAX_BYTES } from "@/features/chat/lib/mediaUtils";

// Fullscreen portal modal for viewing full-size images, videos, and decoded text/code
export function MediaPreviewModal({
  isOpen,
  onClose,
  sourceUrl,
  view,
  isTextual,
  isEncrypted,
  media,
  info,
  textPreview,
  FileIcon,
  displayName,
  downloadName,
  sizeText,
}) {
  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !sourceUrl) return null;

  const isVideoView = view === "media" && info?.kind === "video";
  if (!(view === "image" || isTextual || isVideoView)) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      onClick={onClose}
    >
      {/* Top navigation header */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-900/95 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
            {FileIcon && <FileIcon className="h-4 w-4 text-white" />}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight text-white">
              {media?.fileName || "Document"}
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
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close preview"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main viewer body */}
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
            <img
              src={sourceUrl}
              alt={media?.fileName || "Preview"}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden p-2">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950">
              {textPreview?.status === "loading" ||
              textPreview?.status === "idle" ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading preview…
                </div>
              ) : textPreview?.status === "ready" ? (
                <>
                  <pre
                    tabIndex={0}
                    className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-5 text-white/90 focus:outline-none"
                  >
                    {textPreview.text}
                  </pre>
                  {textPreview.truncated && (
                    <p className="shrink-0 border-t border-white/10 bg-neutral-900 px-4 py-2 text-[11px] text-white/60">
                      Preview shows the first {formatFileSize(TEXT_PREVIEW_MAX_BYTES)}. Save the file to read the rest.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                    {FileIcon && <FileIcon className="h-8 w-8 text-white/80" />}
                  </div>
                  <p className="text-sm text-white/60">
                    {textPreview?.status === "binary"
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
}
