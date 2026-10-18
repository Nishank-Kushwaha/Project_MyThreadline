import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Paperclip,
  Send,
  X,
  File,
  Image as ImageIcon,
} from "lucide-react";
import { formatFileSize } from "@/lib/e2ee/media";

// 15 MiB. Must stay equal to the Multer `limits.fileSize` on the backend.
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

// Extensions offered in the file picker. `accept` is only a hint to the browser
// (users can switch the dialog to "All files"), so handleFileSelect re-checks
// against the same list. This is UX only: the backend must enforce its own
// allowlist and validate file content.
const ACCEPTED_EXTENSIONS = [
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  // Text and data
  ".txt",
  ".csv",
  ".json",
  ".md",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  // Source code
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
  // Archives
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
];
const ACCEPTED_MIME_PREFIXES = ["image/", "audio/", "video/"];
// Used only for validation: some OSes report an empty MIME type for these.
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
  ...ACCEPTED_MIME_PREFIXES.map((p) => `${p}*`),
  ...ACCEPTED_EXTENSIONS,
].join(",");

function isAllowedFile(file) {
  const type = (file.type || "").toLowerCase();
  if (ACCEPTED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix)))
    return true;
  const dot = file.name.lastIndexOf(".");
  return dot > 0 && ALLOWED_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
}

export function MessageInput({ onSend, onTyping, isEncrypted = false }) {
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [fileError, setFileError] = useState("");

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Grow with the text. The CSS max-h (8 lines) stops the growth,
  // and overflow-y-auto turns the box into a scroller after that.
  const fit = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Re-fit on every text change (also shrinks it back after sending)
  useLayoutEffect(fit, [text, fit]);

  // Re-fit when the box gets wider/narrower (e.g. the sidebar is dragged)
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

  // Clean up object URL on file change or unmount
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const handleFileSelect = (e) => {
    setFileError("");
    const file = e.target.files?.[0];
    if (!file) return;

    // Clearing the input lets the user pick the same file again after an error.
    const reject = (message) => {
      setFileError(message);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    if (file.size === 0) return reject("This file is empty.");
    if (file.size > MAX_FILE_SIZE_BYTES)
      return reject("File exceeds the 15 MiB limit.");
    if (!isAllowedFile(file)) return reject("This file type isn't supported.");

    if (filePreview) URL.revokeObjectURL(filePreview);

    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleChange = (e) => {
    setText(e.target.value);
    if (e.target.value) onTyping?.(); // tell the parent "the user is typing"
  };

  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !selectedFile) || isSending) return;

    setIsSending(true);
    setFileError("");
    try {
      // onSend returns false when the message wasn't sent: keep what was typed.
      const sent = await onSend(trimmed, selectedFile);
      if (sent !== false) {
        setText("");
        handleRemoveFile();
      }
    } finally {
      setIsSending(false);
      textareaRef.current?.focus(); // keep typing without clicking again
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send();
  };

  // Enter sends, Shift+Enter adds a new line (like WhatsApp Web).
  // On phones/tablets (touch) Enter always adds a new line; use the button.
  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    send();
  };

  const canSend =
    (text.trim().length > 0 || selectedFile !== null) && !isSending;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {/* File error message */}
      {fileError && (
        <div className="mb-2 text-xs text-destructive">{fileError}</div>
      )}

      {/* Selected file preview card */}
      {selectedFile && (
        <div className="mb-2 flex items-center justify-between rounded-2xl border border-input bg-secondary/60 p-2 pr-3">
          <div className="flex items-center gap-3 overflow-hidden">
            {filePreview ? (
              <img
                src={filePreview}
                alt="Upload preview"
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <File className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(selectedFile.size)}
                {isEncrypted ? " • 🔒 Encrypted before upload" : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemoveFile}
            aria-label="Remove attachment"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-3xl border border-input bg-secondary/40 py-1 pl-2 pr-1 focus-within:ring-2 focus-within:ring-ring">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept={ACCEPT_ATTRIBUTE}
        />

        {/* Attachment Button */}
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

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            selectedFile ? "Add a caption… (optional)" : "Type a message…"
          }
          aria-label="Message"
          autoComplete="off"
          className="max-h-52 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent px-2 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none scrollbar-thin"
        />

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
      </div>
    </form>
  );
}
