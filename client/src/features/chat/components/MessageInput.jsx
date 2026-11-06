import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BarChart2,
  File,
  Loader2,
  Mic,
  Paperclip,
  Reply,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gifToFile, isGifFile } from "@/lib/utils";
import { formatFileSize } from "@/features/e2ee/lib/media";
import { GifPickerButton } from "./media/GifPickerButton";
import { VoiceRecorder } from "./media/VoiceRecorder";
import { CreatePollDialog } from "./polls/CreatePollDialog";
import { LinkPreviewCard, extractFirstUrl } from "./LinkPreview";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".json",
  ".md",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".html",
  ".css",
  ".py",
  ".cpp",
  ".c",
  ".h",
  ".java",
  ".sql",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
];

const ACCEPTED_MIME_PREFIXES = ["image/", "audio/", "video/"];

const MEDIA_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
  ".weba",
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".ogv",
];

const ALLOWED_EXTENSIONS = new Set([
  ...ACCEPTED_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
]);

const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_MIME_PREFIXES.map((prefix) => `${prefix}*`),
  ...ACCEPTED_EXTENSIONS,
].join(",");

// Validates whether the selected file extension or MIME type is allowed
function isAllowedFile(file) {
  const type = (file.type || "").toLowerCase();
  if (ACCEPTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix))) {
    return true;
  }
  const dot = file.name.lastIndexOf(".");
  return dot > 0 && ALLOWED_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

// Checks file size and format constraints
function validateFile(file) {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_SIZE_BYTES) return "File exceeds the 15 MiB limit.";
  if (!isAllowedFile(file)) return "This file type isn't supported.";
  return null;
}

// Quoted reply banner preview above input
function ReplyBanner({ replyingTo, onCancel }) {
  if (!replyingTo) return null;

  return (
    <div className="relative mb-2 flex items-center justify-between overflow-hidden rounded-xl border border-border bg-secondary/80 p-2.5 pl-3.5 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex min-w-0 items-center gap-2.5">
        <Reply className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 text-xs">
          <span className="block truncate font-semibold text-primary">
            {replyingTo.senderName || "Message"}
          </span>
          <p className="truncate text-[11px] text-muted-foreground">
            {replyingTo.text ||
              (replyingTo.mediaType
                ? `[${replyingTo.mediaType.toUpperCase()}]`
                : "Attachment")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Preview card for selected attachments prior to sending
function FilePreviewCard({
  file,
  preview,
  isEncrypted,
  isSending,
  onRemove,
}) {
  if (!file) return null;

  const isVideoOrGif = file.type?.startsWith("video/") || file.isGif;

  return (
    <div className="mb-2 flex items-center justify-between rounded-2xl border border-input bg-secondary/60 p-2 pr-3">
      <div className="flex items-center gap-3 overflow-hidden">
        {preview ? (
          isVideoOrGif ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black">
              <video
                src={preview}
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              {Boolean(file.isGif) && (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-bold text-white">
                  GIF
                </span>
              )}
            </div>
          ) : (
            <img
              src={preview}
              alt="Upload preview"
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <File className="h-6 w-6" />
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {file.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatFileSize(file.size)}
            {isEncrypted ? " • 🔒 Encrypted before upload" : ""}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={isSending}
        aria-label="Remove attachment"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Real-time link preview banner displayed above input
function LinkPreviewBanner({ url, onDismiss }) {
  if (!url) return null;

  return (
    <div className="relative mb-2 overflow-hidden rounded-2xl border border-input bg-secondary/60 p-2 pr-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <LinkPreviewCard url={url} isOwn={false} />
        </div>
        <button
          type="button"
          onClick={() => onDismiss(url)}
          aria-label="Remove link preview"
          title="Remove preview"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Chat input bar coordinating text, media attachments, voice recording and polls
export function MessageInput({
  onSend,
  onTyping,
  replyingTo = null,
  onCancelReply,
  droppedFile = null,
  onClearDroppedFile,
  isEncrypted = true,
}) {
  // Input and attachment states
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileError, setFileError] = useState("");

  // Loading and mode states
  const [isSending, setIsSending] = useState(false);
  const [gifLoading, setGifLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [dismissedUrl, setDismissedUrl] = useState(null);
  const [isPollDialogOpen, setIsPollDialogOpen] = useState(false);

  // References
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Derived values
  const detectedUrl = !selectedFile ? extractFirstUrl(text) : null;
  const showLinkPreview = Boolean(detectedUrl && detectedUrl !== dismissedUrl);
  const hasContent = text.trim().length > 0 || selectedFile !== null;
  const canSend = hasContent && !isSending;

  // Auto-grow textarea with content
  const fit = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(fit, [text, fit]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  // Recalculate height when box width changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // Revoke object URL on change or unmount
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // Updates selected file state and generates object URL preview for media
  const commitFile = (file) => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(file);
    setFilePreview(
      file.type?.startsWith("image/") || file.type?.startsWith("video/")
        ? URL.createObjectURL(file)
        : null,
    );
    return true;
  };

  // Normalizes incoming raw files, validates constraints, and handles GIF transcoding
  const processAndAcceptFile = async (rawFile) => {
    if (!rawFile) return false;

    setFileError("");
    const validationError = validateFile(rawFile);
    if (validationError) {
      setFileError(validationError);
      toast.error(validationError);
      return false;
    }

    let fileToAccept = rawFile;
    if (isGifFile(rawFile)) {
      setGifLoading(true);
      const toastId = toast.loading("Converting GIF to video...");
      try {
        const { convertGifToMp4 } = await import(
          "@/features/chat/lib/gifConverter"
        );
        fileToAccept = await convertGifToMp4(rawFile);
        toast.dismiss(toastId);
      } catch (err) {
        console.error("GIF conversion failed:", err);
        const errMsg =
          "Couldn't convert that GIF to video. Please try another file.";
        setFileError(errMsg);
        toast.error(errMsg, { id: toastId });
        return false;
      } finally {
        setGifLoading(false);
      }
    }

    return commitFile(fileToAccept);
  };

  // Handle files dropped into ChatWindow
  useEffect(() => {
    if (!droppedFile) return;

    let cancelled = false;
    const handleDrop = async () => {
      const accepted = await processAndAcceptFile(droppedFile);
      if (!cancelled) {
        onClearDroppedFile?.();
        if (accepted) textareaRef.current?.focus();
      }
    };

    handleDrop();
    return () => {
      cancelled = true;
    };
  }, [droppedFile]);

  // Handle clipboard file paste (Ctrl+V)
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const accepted = await processAndAcceptFile(file);
          if (accepted) textareaRef.current?.focus();
          return;
        }
      }
    }
  };

  // File picker selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    const accepted = await processAndAcceptFile(file);
    if (accepted) textareaRef.current?.focus();
  };

  // Clear selected file
  const handleRemoveFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Text change and typing notification
  const handleChange = (e) => {
    setText(e.target.value);
    if (e.target.value) onTyping?.();
  };

  // Send message submission
  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !selectedFile) || isSending) return;

    setIsSending(true);
    setFileError("");
    try {
      const sent = await onSend(trimmed, selectedFile);
      if (sent !== false) {
        setText("");
        setDismissedUrl(null);
        handleRemoveFile();
      }
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send();
  };

  // Voice note handlers
  const cancelVoice = useCallback(() => setIsVoiceRecording(false), []);

  const handleSendVoice = async (file) => {
    setIsSending(true);
    setFileError("");
    try {
      const sent = await onSend("", file);
      if (sent !== false) setIsVoiceRecording(false);
    } catch (err) {
      console.error("Voice send failed:", err);
      toast.error("Couldn't send the voice message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // GIF picker selection
  const handleGifSelect = async (gif) => {
    setGifLoading(true);
    setFileError("");
    try {
      const file = await gifToFile(gif);
      commitFile(file);
    } catch {
      const errText = "Couldn't load that GIF. Please try another.";
      setFileError(errText);
      toast.error(errText);
    } finally {
      setGifLoading(false);
    }
  };

  // Poll creation handler
  const handleCreatePoll = async (pollData) => {
    setIsSending(true);
    try {
      return await onSend("", null, pollData);
    } finally {
      setIsSending(false);
    }
  };

  // Keyboard navigation: Enter sends, Shift+Enter adds newline
  const handleKeyDown = (e) => {
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      onCancelReply?.();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    send();
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {/* Reply preview banner */}
        <ReplyBanner replyingTo={replyingTo} onCancel={onCancelReply} />

        {/* Validation error */}
        {fileError && (
          <div className="mb-2 text-xs text-destructive">{fileError}</div>
        )}

        {/* GIF conversion indicator */}
        {gifLoading && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading GIF…
          </div>
        )}

        {/* Real-time link preview */}
        {showLinkPreview && (
          <LinkPreviewBanner url={detectedUrl} onDismiss={setDismissedUrl} />
        )}

        {/* Selected file attachment preview */}
        <FilePreviewCard
          file={selectedFile}
          preview={filePreview}
          isEncrypted={isEncrypted}
          isSending={isSending}
          onRemove={handleRemoveFile}
        />

        {isVoiceRecording ? (
          <VoiceRecorder
            onSendVoice={handleSendVoice}
            onCancel={cancelVoice}
            isSending={isSending}
          />
        ) : (
          <div className="flex items-end gap-2 rounded-3xl border border-input bg-secondary/40 py-1 pl-2 pr-1 focus-within:ring-2 focus-within:ring-ring">
            {/* Hidden file selector */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept={ACCEPT_ATTRIBUTE}
            />

            {/* File attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              aria-label="Attach file"
              title="Attach file or photo"
              className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Tenor GIF picker */}
            <GifPickerButton
              onSelect={handleGifSelect}
              disabled={isSending || gifLoading}
            />

            {/* In-chat poll button */}
            <button
              type="button"
              onClick={() => setIsPollDialogOpen(true)}
              disabled={isSending || isVoiceRecording}
              aria-label="Create poll"
              title="Create a poll"
              className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <BarChart2 className="h-4 w-4" />
            </button>

            {/* Textarea input */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={isSending}
              placeholder={
                selectedFile ? "Add a caption… (optional)" : "Type a message…"
              }
              aria-label="Message"
              autoComplete="off"
              className="max-h-52 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent px-2 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none scrollbar-thin disabled:opacity-60"
            />

            {/* Send or voice record button */}
            {hasContent || isSending ? (
              <Button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="h-10 w-10 shrink-0 rounded-full p-0"
              >
                {isSending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsVoiceRecording(true);
                  onTyping?.();
                }}
                disabled={isSending}
                aria-label="Record voice note"
                title="Record voice message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-50"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </form>

      {/* Poll creation dialog */}
      <CreatePollDialog
        open={isPollDialogOpen}
        onOpenChange={setIsPollDialogOpen}
        onSubmit={handleCreatePoll}
      />
    </>
  );
}
