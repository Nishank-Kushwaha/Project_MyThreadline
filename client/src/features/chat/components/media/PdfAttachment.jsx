import React, { lazy, Suspense, useState } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DownloadLink } from "./DownloadLink";

// Lazy-load PdfViewer so pdfjs-dist is excluded from the initial chat chunk
const PdfViewer = lazy(() =>
  import("./PdfViewer").then((m) => ({ default: m.PdfViewer })),
);

// WhatsApp-style PDF attachment card with inline metadata and viewer modal
export function PdfAttachment({
  isOwn,
  cardTone,
  isLoading,
  displayError,
  sourceUrl,
  media,
  displayName,
  downloadName,
  sizeText,
  isEncrypted,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className={cn("mb-1.5 overflow-hidden rounded-xl border", cardTone)}>
        {/* PDF header row: icon + title + pages */}
        <div className="flex items-center gap-3 px-3 pb-2 pt-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-xs">
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
              {media?.pageCount ? `${media.pageCount} pages · ` : ""}PDF
              {sizeText ? ` · ${sizeText}` : ""}
            </p>
          </div>
        </div>

        {/* Decryption or load error message */}
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
          {/* View action button */}
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

          {/* Download action button */}
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

      {/* PdfViewer full-screen modal */}
      {isModalOpen && sourceUrl && (
        <Suspense fallback={null}>
          <PdfViewer
            blobUrl={sourceUrl}
            fileName={media?.fileName}
            fileSize={media?.fileSize}
            isEncrypted={isEncrypted}
            onClose={() => setIsModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
