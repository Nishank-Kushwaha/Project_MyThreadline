import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  FileArchive,
  FileCode,
  File,
  Loader2,
  X,
  ExternalLink,
  Eye,
} from "lucide-react";
import { decryptMedia, formatFileSize } from "@/lib/e2ee/media";
import { cn } from "@/lib/utils";

function getFileIcon(fileType = "", fileName = "") {
  const lower = fileName.toLowerCase();
  if (fileType.includes("pdf") || lower.endsWith(".pdf")) return FileText;
  if (
    fileType.includes("zip") ||
    fileType.includes("tar") ||
    fileType.includes("compressed") ||
    lower.endsWith(".zip") ||
    lower.endsWith(".rar") ||
    lower.endsWith(".7z") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".gz")
  ) {
    return FileArchive;
  }
  if (
    fileType.includes("javascript") ||
    fileType.includes("json") ||
    fileType.includes("html") ||
    fileType.includes("text") ||
    /\.(js|jsx|ts|tsx|json|html|css|py|md|txt|csv|log)$/i.test(lower)
  ) {
    return FileCode;
  }
  return File;
}

export function MediaAttachment({ media, isOwn }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isEncrypted = Boolean(media?.key && media?.iv);
  const lowerName = (media?.fileName || "").toLowerCase();
  const isImage =
    media?.fileType?.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(lowerName);
  const isPdf =
    media?.fileType === "application/pdf" || lowerName.endsWith(".pdf");
  const isTextOrCode =
    media?.fileType?.startsWith("text/") ||
    /\.(txt|json|csv|md|log|js|jsx|ts|tsx|html|css|py)$/i.test(lowerName);

  useEffect(() => {
    let cancelled = false;

    if (!media?.url) return;

    // If it's not encrypted, we can use the remote URL directly
    if (!isEncrypted) {
      setBlobUrl(media.url);
      return;
    }

    // Encrypted media: fetch encrypted blob from storage and decrypt with AES-GCM
    setIsLoading(true);
    setError(null);

    decryptMedia({
      url: media.url,
      key: media.key,
      iv: media.iv,
      fileType: media.fileType,
      fileName: media.fileName,
    })
      .then((url) => {
        if (!cancelled) {
          setBlobUrl(url);
          setIsLoading(false);
        }
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

  // Close modal on Escape key press
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isModalOpen]);

  if (!media?.url) return null;

  const FileIcon = getFileIcon(media.fileType, media.fileName);

  // Fullscreen WhatsApp-style In-App Viewer Modal
  const renderModal = () => {
    if (!isModalOpen || !blobUrl) return null;

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white backdrop-blur-md animate-in fade-in duration-150"
        onClick={() => setIsModalOpen(false)}
      >
        {/* Top Header Bar (WhatsApp Web style) */}
        <header
          className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-900/90 px-4 md:px-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
              <FileIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">
                {media.fileName || "Document"}
              </h2>
              <p className="text-xs text-white/60">
                {formatFileSize(media.fileSize)}
                {isEncrypted ? " • 🔒 End-to-end encrypted" : ""}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Open in new tab */}
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
            </a>

            {/* Separate Download button */}
            <a
              href={blobUrl}
              download={media.fileName || "download"}
              title="Download file"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </a>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              title="Close (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Viewer Content Body */}
        <div
          className="flex flex-1 items-center justify-center overflow-hidden p-2 md:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {isPdf ? (
            <div className="h-full w-full max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
              <iframe
                src={`${blobUrl}#toolbar=1`}
                title={media.fileName || "PDF Viewer"}
                className="h-full w-full border-0 bg-white"
              />
            </div>
          ) : isImage ? (
            <img
              src={blobUrl}
              alt={media.fileName || "Preview"}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          ) : isTextOrCode ? (
            <div className="h-full w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
              <iframe
                src={blobUrl}
                title={media.fileName || "Text Viewer"}
                className="h-full w-full border-0 bg-neutral-950 text-white"
              />
            </div>
          ) : (
            /* Fallback for unsupported in-browser preview formats (.zip, .exe, etc.) */
            <div className="flex max-w-md flex-col items-center rounded-2xl border border-white/10 bg-neutral-900/80 p-8 text-center shadow-2xl backdrop-blur">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
                <FileIcon className="h-8 w-8" />
              </div>
              <h3 className="mb-1 text-base font-semibold text-white">
                {media.fileName}
              </h3>
              <p className="mb-6 text-xs text-white/60">
                {formatFileSize(media.fileSize)} • No preview available for this file type
              </p>
              <a
                href={blobUrl}
                download={media.fileName || "download"}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                <span>Download file</span>
              </a>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  };

  // IMAGE ATTACHMENT CARD
  if (isImage) {
    return (
      <div className="mb-1.5 overflow-hidden rounded-xl">
        {isLoading ? (
          <div className="flex h-48 w-64 max-w-full items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
            <div className="flex flex-col items-center gap-2 text-xs opacity-70">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Decrypting image…</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-32 w-60 items-center justify-center rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : (
          blobUrl && (
            <>
              <div
                onClick={() => setIsModalOpen(true)}
                className="group/img relative max-w-sm cursor-pointer overflow-hidden rounded-lg"
              >
                <img
                  src={blobUrl}
                  alt={media.fileName || "Shared image"}
                  className="max-h-72 w-auto max-w-full rounded-lg object-contain transition-transform duration-150 hover:opacity-95"
                  loading="lazy"
                />
                <a
                  href={blobUrl}
                  download={media.fileName || "image"}
                  onClick={(e) => e.stopPropagation()}
                  title="Download image"
                  className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-md transition-opacity duration-150 hover:bg-black/80 group-hover/img:opacity-100"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>

              {renderModal()}
            </>
          )
        )}
      </div>
    );
  }

  // FILE / DOCUMENT ATTACHMENT CARD
  return (
    <>
      <div
        onClick={() => {
          if (!isLoading && blobUrl) {
            setIsModalOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isLoading && blobUrl) setIsModalOpen(true);
          }
        }}
        className={cn(
          "group/doc mb-1.5 flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-all select-none",
          isOwn
            ? "border-black/10 bg-black/5 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            : "border-border bg-background/60 hover:bg-muted/80",
          isLoading && "cursor-wait opacity-80",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover/doc:scale-105">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <FileIcon className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground group-hover/doc:text-primary transition-colors">
            {media.fileName || "Attachment"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatFileSize(media.fileSize)}
            {isEncrypted ? " • End-to-end encrypted" : ""}
          </p>
        </div>

        {/* Preview Cue */}
        {blobUrl && !isLoading && (
          <div className="flex items-center gap-1">
            <span
              title="Click to preview"
              className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-background/80 hover:opacity-100"
            >
              <Eye className="h-4 w-4" />
            </span>

            {/* Separate Download Button (does not trigger preview modal) */}
            <a
              href={blobUrl}
              download={media.fileName || "file"}
              onClick={(e) => e.stopPropagation()}
              title={`Download ${media.fileName || "file"}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted hover:scale-105 active:scale-95"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

      {renderModal()}
    </>
  );
}
