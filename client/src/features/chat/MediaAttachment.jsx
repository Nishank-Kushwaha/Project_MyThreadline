import React, { useEffect, useState } from "react";
import {
  Download,
  FileText,
  FileArchive,
  FileCode,
  File,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { decryptMedia, formatFileSize } from "@/lib/e2ee/media";
import { cn } from "@/lib/utils";

function getFileIcon(fileType = "", fileName = "") {
  if (fileType.includes("pdf") || fileName.endsWith(".pdf")) return FileText;
  if (
    fileType.includes("zip") ||
    fileType.includes("tar") ||
    fileType.includes("compressed") ||
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar")
  ) {
    return FileArchive;
  }
  if (
    fileType.includes("javascript") ||
    fileType.includes("json") ||
    fileType.includes("html") ||
    fileName.endsWith(".js") ||
    fileName.endsWith(".json")
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
  const isImage =
    media?.fileType?.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(media?.fileName || "");

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
  }, [media?.url, media?.key, media?.iv, media?.fileType, isEncrypted]);

  if (!media?.url) return null;

  const FileIcon = getFileIcon(media.fileType, media.fileName);

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isModalOpen]);

  // IMAGE ATTACHMENT
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
              <div className="group/img relative max-w-sm cursor-pointer overflow-hidden rounded-lg">
                <img
                  src={blobUrl}
                  alt={media.fileName || "Shared image"}
                  onClick={() => setIsModalOpen(true)}
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

              {/* Fullscreen Modal View */}
              {isModalOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  <div
                    className="relative max-h-[90vh] max-w-[90vw]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={blobUrl}
                      alt={media.fileName || "Full view"}
                      className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      <a
                        href={blobUrl}
                        download={media.fileName || "image"}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                        title="Close"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
    );
  }

  // FILE / DOCUMENT ATTACHMENT
  return (
    <div
      className={cn(
        "mb-1.5 flex items-center gap-3 rounded-xl border p-2.5 transition-colors",
        isOwn
          ? "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
          : "border-border bg-background/60",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileIcon className="h-5 w-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {media.fileName || "Attachment"}
        </p>
        <p className="text-[10px] opacity-70">
          {formatFileSize(media.fileSize)}
          {isEncrypted && " • End-to-end encrypted"}
        </p>
      </div>

      {blobUrl && !isLoading && (
        <a
          href={blobUrl}
          download={media.fileName || "file"}
          title={`Download ${media.fileName || "file"}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
