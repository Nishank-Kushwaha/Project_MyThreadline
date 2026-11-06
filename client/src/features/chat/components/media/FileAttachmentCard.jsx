import React from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DownloadLink } from "./DownloadLink";

// Generic file card for documents, archives, code, and unsupported formats
export function FileAttachmentCard({
  isOwn,
  cardTone,
  isLoading,
  displayError,
  sourceUrl,
  displayName,
  downloadName,
  metaLine,
  FileIcon,
  previewable,
  onOpenPreview,
}) {
  const handleKeyDown = (e) => {
    if (!previewable || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenPreview?.();
    }
  };

  return (
    <div
      onClick={previewable ? onOpenPreview : undefined}
      role={previewable ? "button" : undefined}
      tabIndex={previewable ? 0 : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "group/doc mb-1.5 flex items-center gap-3 rounded-xl border p-2.5 transition-all",
        cardTone,
        previewable &&
          (isOwn
            ? "cursor-pointer select-none hover:bg-black/10 dark:hover:bg-white/10"
            : "cursor-pointer select-none hover:bg-muted/80"),
        isLoading && "cursor-wait opacity-80",
      )}
    >
      {/* File type icon or loading spinner */}
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
          FileIcon && <FileIcon className="h-5 w-5" />
        )}
      </div>

      {/* File name & metadata description */}
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

      {/* Direct download button */}
      {sourceUrl && !isLoading && !displayError && (
        <DownloadLink
          href={sourceUrl}
          fileName={downloadName}
          stopPropagation
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-xs transition hover:scale-105 hover:bg-muted active:scale-95"
        >
          <Download className="h-4 w-4" />
        </DownloadLink>
      )}
    </div>
  );
}
