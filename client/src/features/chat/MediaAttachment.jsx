import React, { useEffect, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FileText,
  FileArchive,
  FileCode,
  File,
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

// ── Helpers ────────────────────────────────────────────────────────────────

function getFileIcon(fileType = "", fileName = "") {
  const lower = fileName.toLowerCase();
  if (fileType.includes("pdf") || lower.endsWith(".pdf")) return FileText;
  if (
    fileType.includes("zip") ||
    fileType.includes("tar") ||
    fileType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/i.test(lower)
  )
    return FileArchive;
  if (
    fileType.includes("javascript") ||
    fileType.includes("json") ||
    fileType.includes("html") ||
    fileType.includes("text") ||
    /\.(js|jsx|ts|tsx|json|html|css|py|md|txt|csv|log)$/i.test(lower)
  )
    return FileCode;
  return File;
}

// ── Component ──────────────────────────────────────────────────────────────

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

  // ── Decrypt / load blob ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!media?.url) return;

    if (!isEncrypted) {
      setBlobUrl(media.url);
      return;
    }

    setIsLoading(true);
    setError(null);

    decryptMedia({
      url: media.url,
      key: media.key,
      iv: media.iv,
      fileType: media.fileType,
      fileName: media.fileName,
    })
      .then((url) => { if (!cancelled) { setBlobUrl(url); setIsLoading(false); } })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to decrypt media attachment:", err);
          setError("Failed to decrypt media");
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [media?.url, media?.key, media?.iv, media?.fileType, media?.fileName, isEncrypted]);

  // ── Close on Escape ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setIsModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen]);

  if (!media?.url) return null;

  const FileIcon = getFileIcon(media.fileType, media.fileName);

  // ── Full-screen viewer modal (portal) ──────────────────────────────────
  const renderModal = () => {
    if (!isModalOpen || !blobUrl) return null;

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
        onClick={() => setIsModalOpen(false)}
      >
        {/* ── Top header bar ── */}
        <header
          className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-900/95 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 overflow-hidden min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <FileIcon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white leading-tight">
                {media.fileName || "Document"}
              </h2>
              <p className="text-[11px] text-white/50 leading-tight">
                {formatFileSize(media.fileSize)}
                {isEncrypted ? " • 🔒 E2E encrypted" : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 pl-3">
            {/* Save as (download) */}
            <a
              href={blobUrl}
              download={media.fileName || "download"}
              title="Save as…"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </a>

            {/* Close */}
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              title="Close (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ── Viewer body ── */}
        <div
          className="flex flex-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {isPdf ? (
            /* PDF.js canvas viewer — works on all devices including Android Chrome */
            <Suspense
              fallback={
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Loading PDF reader…</p>
                </div>
              }
            >
              <PdfViewer blobUrl={blobUrl} fileName={media.fileName} />
            </Suspense>
          ) : isImage ? (
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              <img
                src={blobUrl}
                alt={media.fileName || "Preview"}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>
          ) : isTextOrCode ? (
            <div className="flex flex-1 overflow-hidden p-2">
              <iframe
                src={blobUrl}
                title={media.fileName || "Text Viewer"}
                className="h-full w-full rounded-xl border border-white/10 bg-neutral-950"
                style={{ border: "none" }}
              />
            </div>
          ) : (
            /* Unsupported format — download prompt */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                <FileIcon className="h-8 w-8 text-white/80" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">{media.fileName}</p>
                <p className="mt-1 text-sm text-white/50">
                  {formatFileSize(media.fileSize)} · No preview available
                </p>
              </div>
              <a
                href={blobUrl}
                download={media.fileName || "download"}
                className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                Save as…
              </a>
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
                  className="max-h-72 w-auto max-w-full rounded-lg object-contain transition-opacity hover:opacity-95"
                  loading="lazy"
                />
                <a
                  href={blobUrl}
                  download={media.fileName || "image"}
                  onClick={(e) => e.stopPropagation()}
                  title="Save as…"
                  className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-md transition-opacity hover:bg-black/80 group-hover/img:opacity-100"
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

  // ══════════════════════════════════════════════════════════════════════════
  // PDF ATTACHMENT — WhatsApp-style bubble card
  // ══════════════════════════════════════════════════════════════════════════
  if (isPdf) {
    return (
      <>
        <div
          className={cn(
            "mb-1.5 overflow-hidden rounded-xl border",
            isOwn
              ? "border-black/15 bg-black/5 dark:border-white/10 dark:bg-white/5"
              : "border-border bg-background/60",
          )}
        >
          {/* ── PDF card top row: icon + name + size ── */}
          <div className="flex items-center gap-3 px-3 pt-3 pb-2">
            {/* Red PDF icon — matches WhatsApp */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-sm">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground leading-snug">
                {media.fileName || "Document.pdf"}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {media.pageCount ? `${media.pageCount} pages · ` : ""}PDF
                {media.fileSize ? ` · ${formatFileSize(media.fileSize)}` : ""}
              </p>
            </div>
          </div>

          {/* ── Error state ── */}
          {error && (
            <div className="flex items-center gap-1.5 px-3 pb-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Action buttons: View | Save as… ── */}
          <div
            className={cn(
              "flex border-t",
              isOwn
                ? "border-black/10 dark:border-white/10"
                : "border-border",
            )}
          >
            {/* View button — opens full-screen PDF.js viewer */}
            <button
              type="button"
              onClick={() => { if (blobUrl && !isLoading) setIsModalOpen(true); }}
              disabled={isLoading || !blobUrl}
              className={cn(
                "flex flex-1 items-center justify-center py-2 text-sm font-semibold transition",
                "border-r",
                isOwn
                  ? "border-black/10 text-foreground hover:bg-black/10 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
                  : "border-border text-primary hover:bg-primary/8",
                (isLoading || !blobUrl) && "cursor-not-allowed opacity-50",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "View"
              )}
            </button>

            {/* Save as… button — direct download */}
            {blobUrl && !isLoading ? (
              <a
                href={blobUrl}
                download={media.fileName || "document.pdf"}
                className={cn(
                  "flex flex-1 items-center justify-center py-2 text-sm font-semibold transition",
                  isOwn
                    ? "text-foreground hover:bg-black/10 dark:text-white dark:hover:bg-white/10"
                    : "text-primary hover:bg-primary/8",
                )}
              >
                Save as…
              </a>
            ) : (
              <span
                className="flex flex-1 items-center justify-center py-2 text-sm font-semibold opacity-40 cursor-not-allowed"
              >
                Save as…
              </span>
            )}
          </div>
        </div>

        {renderModal()}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GENERIC FILE ATTACHMENT CARD (zip, docx, etc.)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <div
        onClick={() => { if (!isLoading && blobUrl) setIsModalOpen(true); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isLoading && blobUrl) {
            e.preventDefault();
            setIsModalOpen(true);
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
          <p className="truncate text-xs font-medium text-foreground transition-colors group-hover/doc:text-primary">
            {media.fileName || "Attachment"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatFileSize(media.fileSize)}
            {isEncrypted ? " · E2E encrypted" : ""}
          </p>
        </div>

        {blobUrl && !isLoading && (
          <a
            href={blobUrl}
            download={media.fileName || "file"}
            onClick={(e) => e.stopPropagation()}
            title="Save as…"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted hover:scale-105 active:scale-95"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {renderModal()}
    </>
  );
}
