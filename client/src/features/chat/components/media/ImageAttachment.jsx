import React from "react";
import { Download, Loader2 } from "lucide-react";
import { DownloadLink } from "./DownloadLink";

// Inline image preview with lazy-loading and quick download action
export function ImageAttachment({
  isLoading,
  displayError,
  sourceUrl,
  media,
  downloadName,
  onOpenModal,
  onError,
}) {
  if (isLoading) {
    return (
      <div className="mb-1.5 flex h-48 w-64 max-w-full items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
        <div className="flex flex-col items-center gap-2 text-xs opacity-70">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Decrypting image…</span>
        </div>
      </div>
    );
  }

  if (displayError) {
    return (
      <div className="mb-1.5 flex h-32 w-60 items-center justify-center rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
        {displayError}
      </div>
    );
  }

  if (!sourceUrl) return null;

  return (
    <div className="mb-1.5 overflow-hidden rounded-xl">
      <div
        onClick={onOpenModal}
        className="group/img relative max-w-sm cursor-pointer overflow-hidden rounded-lg"
      >
        <img
          src={sourceUrl}
          alt={media?.fileName || "Shared image"}
          className="max-h-72 w-auto max-w-full rounded-lg object-contain transition-opacity hover:opacity-95"
          loading="lazy"
          onError={onError}
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
    </div>
  );
}
