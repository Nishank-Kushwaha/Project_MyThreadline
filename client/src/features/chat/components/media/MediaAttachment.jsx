import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, FileAudio, FileVideo, Loader2 } from "lucide-react";
import { decryptMedia, formatFileSize } from "@/features/e2ee/lib/media";
import { cn } from "@/lib/utils";
import { CustomAudioPlayer } from "./CustomAudioPlayer";
import { CustomVideoPlayer } from "./CustomVideoPlayer";
import { DownloadLink } from "./DownloadLink";
import { FileAttachmentCard } from "./FileAttachmentCard";
import { GifVideoPlayer, isGifVideo } from "./GifVideoPlayer";
import { ImageAttachment } from "./ImageAttachment";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { PdfAttachment } from "./PdfAttachment";
import {
  canBrowserPlay,
  classifyAttachment,
  EXTENSION_MEDIA_MIME,
  getFileIcon,
  readTextPreview,
} from "@/features/chat/lib/mediaUtils";

// Multi-format media attachment orchestrator with client-side decryption
export function MediaAttachment({ media, isOwn }) {
  // Component state
  const [decryptedUrl, setDecryptedUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [textPreview, setTextPreview] = useState({
    status: "idle",
    text: "",
    truncated: false,
  });

  // Encryption status
  const hasKey = Boolean(media?.key);
  const hasIv = Boolean(media?.iv);
  const isEncrypted = hasKey && hasIv;
  const hasPartialKeys = hasKey !== hasIv;

  // Media classification and capabilities
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
      info.kind === "audio" ||
      (info.kind === "video" && canBrowserPlay(info.kind, playMime)),
    [info.kind, playMime],
  );

  const isGifClip = isGifVideo(media, info.kind);

  const isVoiceNote =
    info.kind === "audio" &&
    (String(media?.fileName || "").toLowerCase().includes("voice-message") ||
      String(media?.fileName || "").toLowerCase().includes("voice-note") ||
      Boolean(media?.isVoiceNote));

  const parsedDuration = useMemo(() => {
    if (media?.duration && isFinite(media.duration)) return media.duration;
    const match = String(media?.fileName || "").match(/_dur(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }, [media?.duration, media?.fileName]);

  // Determine active presentation view
  let view = "generic";
  if (info.kind === "pdf") view = "pdf";
  else if (isGifClip && canPlay && !previewBroken) view = "gif";
  else if (info.kind === "image" && !previewBroken) view = "image";
  else if (
    (info.kind === "audio" || info.kind === "video") &&
    canPlay &&
    !previewBroken
  )
    view = "media";

  // Resolved source URL and error state
  const sourceUrl = hasPartialKeys
    ? null
    : isEncrypted
      ? decryptedUrl
      : media?.url;
  const displayError = hasPartialKeys
    ? "Missing decryption information for this attachment"
    : error;

  // Presentation labels & styling
  const FileIcon = getFileIcon(media?.fileType, media?.fileName);
  const displayName =
    media?.fileName || (view === "pdf" ? "Document.pdf" : "Attachment");
  const downloadName =
    media?.fileName || (view === "pdf" ? "document.pdf" : "attachment");
  const sizeText = media?.fileSize ? formatFileSize(media.fileSize) : "";
  const metaLine = [info.label, sizeText].filter(Boolean).join(" · ");
  const cardTone = isOwn
    ? "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
    : "border-border bg-background/60";
  const previewable =
    isTextual && Boolean(sourceUrl) && !isLoading && !displayError;

  // Decrypt media content when encrypted
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

  // Load text/code preview on modal demand
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

  if (!media) return null;

  // Unavailable attachment state
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

  // Image view
  if (view === "image") {
    return (
      <>
        <ImageAttachment
          isLoading={isLoading}
          displayError={displayError}
          sourceUrl={sourceUrl}
          media={media}
          downloadName={downloadName}
          onOpenModal={() => setIsModalOpen(true)}
          onError={() => {
            setIsModalOpen(false);
            setPreviewBroken(true);
          }}
        />
        <MediaPreviewModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          sourceUrl={sourceUrl}
          view={view}
          isTextual={isTextual}
          isEncrypted={isEncrypted}
          media={media}
          info={info}
          textPreview={textPreview}
          FileIcon={FileIcon}
          displayName={displayName}
          downloadName={downloadName}
          sizeText={sizeText}
        />
      </>
    );
  }

  // PDF view
  if (view === "pdf") {
    return (
      <PdfAttachment
        isOwn={isOwn}
        cardTone={cardTone}
        isLoading={isLoading}
        displayError={displayError}
        sourceUrl={sourceUrl}
        media={media}
        displayName={displayName}
        downloadName={downloadName}
        sizeText={sizeText}
        isEncrypted={isEncrypted}
      />
    );
  }

  // WhatsApp-style looping GIF video
  if (view === "gif") {
    return (
      <div className="mb-1.5 overflow-hidden rounded-xl">
        <GifVideoPlayer
          src={sourceUrl}
          isLoading={isLoading}
          error={displayError}
          timeLabel={media.timeLabel}
          onError={() => setPreviewBroken(true)}
        />
      </div>
    );
  }

  // Audio / Video custom responsive players
  if (view === "media") {
    const onPlayerError = (e) => {
      console.warn("Media player failed to play:", e);
      setPreviewBroken(true);
    };

    return (
      <>
        <div
          className={cn(
            "mb-1.5 w-full max-w-70 sm:max-w-xs md:max-w-sm rounded-2xl border shadow-xs transition-all",
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
                onOpenFullscreen={() => setIsModalOpen(true)}
                onError={onPlayerError}
              />
            ) : (
              <CustomAudioPlayer
                src={sourceUrl}
                isOwn={isOwn}
                isVoiceNote={isVoiceNote}
                fallbackDuration={parsedDuration}
                downloadName={downloadName}
                onError={onPlayerError}
              />
            ))
          )}

          {/* Bottom metadata and download row for non-voice notes */}
          {!isVoiceNote && (
            <div className="flex items-center justify-between gap-2.5 border-t border-black/5 dark:border-white/10 px-3 py-2 bg-black/2 dark:bg-white/2">
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
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-xs transition hover:scale-105 hover:bg-muted active:scale-95"
                >
                  <Download className="h-3.5 w-3.5" />
                </DownloadLink>
              )}
            </div>
          )}
        </div>

        <MediaPreviewModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          sourceUrl={sourceUrl}
          view={view}
          isTextual={isTextual}
          isEncrypted={isEncrypted}
          media={media}
          info={info}
          textPreview={textPreview}
          FileIcon={FileIcon}
          displayName={displayName}
          downloadName={downloadName}
          sizeText={sizeText}
        />
      </>
    );
  }

  // Generic document or file attachment card
  return (
    <>
      <FileAttachmentCard
        isOwn={isOwn}
        cardTone={cardTone}
        isLoading={isLoading}
        displayError={displayError}
        sourceUrl={sourceUrl}
        displayName={displayName}
        downloadName={downloadName}
        metaLine={metaLine}
        FileIcon={FileIcon}
        previewable={previewable}
        onOpenPreview={() => setIsModalOpen(true)}
      />
      <MediaPreviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sourceUrl={sourceUrl}
        view={view}
        isTextual={isTextual}
        isEncrypted={isEncrypted}
        media={media}
        info={info}
        textPreview={textPreview}
        FileIcon={FileIcon}
        displayName={displayName}
        downloadName={downloadName}
        sizeText={sizeText}
      />
    </>
  );
}
