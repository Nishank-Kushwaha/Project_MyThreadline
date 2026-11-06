import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCheck,
  Copy,
  Lock,
  MoreVertical,
  Pencil,
  Reply,
  Smile,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MediaAttachment } from "./media/MediaAttachment";
import { PollBubble } from "./polls/PollBubble";
import { QuickReactBar } from "./QuickReactBar";
import { ReactionPills } from "./ReactionPills";
import {
  FormattedMessageText,
  LinkPreviewCard,
  extractFirstUrl,
} from "./LinkPreview";

// Lazy-loaded emoji picker popover to keep emoji datasets out of initial bundle
const EmojiPickerPopover = lazy(() =>
  import("./media/EmojiPickerPopover").then((m) => ({
    default: m.EmojiPickerPopover,
  })),
);

const QUICK_BAR_DURATION = 3000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MENU_W = 176;
const MOBILE_BREAKPOINT = 640;

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

// Determines delivery status across all room recipients
function getStatus(message, recipientCount) {
  const seen = message.seenBy?.length ?? 0;
  const delivered = message.deliveredTo?.length ?? 0;

  if (recipientCount > 0 && seen >= recipientCount) {
    return "seen";
  }

  if (recipientCount > 0 && delivered >= recipientCount) {
    return "delivered";
  }

  return "sent";
}

// Delivery status tick marks (sent, delivered, seen)
function Ticks({ status }) {
  if (status === "seen") {
    return (
      <CheckCheck className="h-3.5 w-3.5 text-blue-800" aria-label="Seen" />
    );
  }

  if (status === "delivered") {
    return (
      <CheckCheck className="h-3.5 w-3.5 opacity-60" aria-label="Delivered" />
    );
  }

  return <Check className="h-3.5 w-3.5 opacity-60" aria-label="Sent" />;
}

// Computes preview text snippet and media label for message replies
function resolveReplySnippet(message, hasPoll) {
  let snippet = message.text || "";
  if (hasPoll) {
    snippet = `📊 Poll: ${message.poll?.question || "Poll"}`;
  }

  let mediaType = "";
  if (message.media) {
    const mime = String(message.media.fileType || "").toLowerCase();
    const fname = String(message.media.fileName || "").toLowerCase();
    const isGif =
      mime === "image/gif" ||
      mime === "video/gif" ||
      fname.endsWith(".gif") ||
      fname.endsWith(".gifv") ||
      message.media.isGif;

    if (isGif) {
      mediaType = "gif";
    } else if (mime.startsWith("image/")) {
      mediaType = "image";
    } else if (mime.startsWith("video/")) {
      mediaType = "video";
    } else if (mime.startsWith("audio/")) {
      mediaType = "audio";
    } else {
      mediaType = "file";
    }

    if (!snippet) {
      snippet =
        mediaType === "gif"
          ? "🎞️ GIF"
          : mediaType === "image"
            ? "📷 Photo"
            : mediaType === "video"
              ? "🎥 Video"
              : mediaType === "audio"
                ? "🎵 Audio"
                : `📎 ${message.media.fileName || "File"}`;
    }
  }

  return { snippet, mediaType };
}

// Fixed-position popup menu for message actions (reply, copy, edit, delete)
function MessageOptionsMenu({
  open,
  position,
  isOwn,
  canEdit,
  hasCopy,
  hasReply,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onClose,
}) {
  if (!open || !position) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 max-sm:bg-black/30" onClick={onClose}>
      <div
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{
          top: position.top,
          left: position.left,
          width: MENU_W,
        }}
        className="fixed rounded-xl border border-border bg-background p-1 text-foreground shadow-xl"
      >
        {hasReply && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onReply();
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Reply className="h-4 w-4" />
            <span>Reply</span>
          </button>
        )}

        {hasCopy && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onCopy();
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            <span>Copy text</span>
          </button>
        )}

        {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            <span>Edit message</span>
          </button>
        )}

        {isOwn && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onDelete();
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete message</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Quoted reply snippet preview inside the bubble
function QuotedMessagePreview({ replyTo, isOwn, onScrollToQuoted }) {
  if (!replyTo?.messageId) return null;

  return (
    <div
      onClick={() => onScrollToQuoted(replyTo.messageId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onScrollToQuoted(replyTo.messageId);
        }
      }}
      className={cn(
        "relative mb-2 flex cursor-pointer select-none items-start gap-2 overflow-hidden rounded-lg p-2 pl-3 text-left transition hover:opacity-90",
        isOwn
          ? "bg-black/15 text-primary-foreground"
          : "bg-black/5 text-foreground dark:bg-white/5",
      )}
      title="Jump to quoted message"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isOwn ? "bg-primary-foreground" : "bg-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[11px] font-semibold",
            isOwn ? "text-primary-foreground" : "text-primary",
          )}
        >
          {replyTo.senderName || "Message"}
        </p>
        <p className="line-clamp-2 wrap-break-word text-xs opacity-85">
          {replyTo.text ||
            (replyTo.mediaType
              ? `[${replyTo.mediaType.toUpperCase()}]`
              : "Attachment")}
        </p>
      </div>
    </div>
  );
}

// In-bubble text editor when editing an existing message
function MessageEditForm({
  value,
  onChange,
  onKeyDown,
  onSave,
  onCancel,
}) {
  return (
    <div className="flex min-w-45 flex-col gap-2">
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-8 border-foreground/20 bg-background/20 text-sm text-inherit placeholder:text-inherit/60"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs opacity-80 hover:bg-black/10 hover:opacity-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md bg-black/15 px-2 py-1 text-xs font-medium hover:bg-black/25"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// Individual chat message bubble supporting media, polls, reactions, swiping and edit actions
export function MessageBubble({
  message,
  isOwn,
  isGroup,
  recipientCount,
  currentUserId,
  editable = true,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onVote,
}) {
  // Quick emoji bar and picker states
  const [showQuickBar, setShowQuickBar] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [quickBarTop, setQuickBarTop] = useState(null);

  // In-line editing states
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);

  // Options context menu states
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [menuPos, setMenuPos] = useState(null);

  // Mobile swipe-to-reply offset state
  const [swipeOffset, setSwipeOffset] = useState(0);

  // References
  const quickBarTimer = useRef(null);
  const bubbleRef = useRef(null);
  const dotsRef = useRef(null);
  const quickBarWrapRef = useRef(null);
  const touchStartRef = useRef(null);
  const isSwipingRef = useRef(false);

  // Derived flags & timestamp
  const isDeleted = Boolean(message.deletedAt);
  const undecryptable =
    message.decrypt === "failed" ||
    message.decrypt === "other-device" ||
    message.decrypt === "not-recipient";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const showAvatar = isGroup && !isOwn;
  const hasPoll = Boolean(message.poll && message.poll.question);
  const isWithinEditWindow =
    Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
  const canEdit = Boolean(
    isOwn && editable && !message.media && !hasPoll && isWithinEditWindow,
  );
  const hasCopy = Boolean(message.text || hasPoll);
  const hasReply = Boolean(onReply && !isDeleted);

  // Close quick bar when clicking outside
  useEffect(() => {
    if (!showQuickBar) return;

    const handleOutside = (e) => {
      if (quickBarWrapRef.current?.contains(e.target)) return;
      clearTimeout(quickBarTimer.current);
      setShowQuickBar(false);
    };

    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [showQuickBar]);

  // Close options menu when viewport is resized or rotated
  useEffect(() => {
    if (!showMessageMenu) return;
    const handleClose = () => setShowMessageMenu(false);
    window.addEventListener("resize", handleClose);
    return () => window.removeEventListener("resize", handleClose);
  }, [showMessageMenu]);

  // Timer cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(quickBarTimer.current);
    };
  }, []);

  // Quick reaction bar timers and toggles
  const clearQuickBarTimer = () => {
    clearTimeout(quickBarTimer.current);
    quickBarTimer.current = null;
  };

  const startQuickBarTimer = () => {
    clearQuickBarTimer();
    quickBarTimer.current = setTimeout(() => {
      setShowQuickBar(false);
    }, QUICK_BAR_DURATION);
  };

  const toggleQuickBar = () => {
    if (showQuickBar) {
      clearQuickBarTimer();
      setShowQuickBar(false);
      return;
    }

    const b = bubbleRef.current?.getBoundingClientRect();
    if (b && window.innerWidth < 768) {
      setQuickBarTop(clamp(b.top + b.height / 2, 28, window.innerHeight - 28));
    }

    setShowQuickBar(true);
    startQuickBarTimer();
  };

  const handlePick = (emoji) => {
    clearQuickBarTimer();
    onReact(message._id, emoji);
    setShowQuickBar(false);
  };

  const handleOpenFullPicker = () => {
    clearQuickBarTimer();
    setShowQuickBar(false);
    setShowFullPicker(true);
  };

  // Reply triggering handler
  const handleReply = () => {
    if (!onReply || isDeleted) return;
    const { snippet, mediaType } = resolveReplySnippet(message, hasPoll);

    onReply({
      messageId: message._id,
      senderName: isOwn ? "You" : message.sender?.name || "User",
      text: snippet,
      mediaType,
    });
  };

  // Swipe-to-reply touch gestures
  const handleTouchStart = (e) => {
    if (isDeleted || isEditing || !onReply) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    isSwipingRef.current = false;
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!isSwipingRef.current && Math.abs(dy) > Math.abs(dx)) {
      touchStartRef.current = null;
      return;
    }

    if (dx > 8) {
      isSwipingRef.current = true;
      const damped = Math.min(dx * 0.45, 70);
      setSwipeOffset(damped);
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingRef.current && swipeOffset >= 35) {
      handleReply();
      if (navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch {}
      }
    }
    touchStartRef.current = null;
    isSwipingRef.current = false;
    setSwipeOffset(0);
  };

  // Editing handlers
  const startEdit = () => {
    if (!canEdit) return;
    setEditText(message.text);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText(message.text);
  };

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) {
      setIsEditing(false);
      return;
    }
    onEdit(message._id, trimmed);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Deletion handler
  const handleDeleteClick = () => {
    if (window.confirm("Delete this message? This can't be undone.")) {
      onDelete(message._id, message.media?.publicId);
    }
  };

  // Clipboard copy handler
  const copyMessageText = async () => {
    let textToCopy = message.text;
    if (hasPoll) {
      textToCopy = [
        `📊 ${message.poll.question}`,
        ...(message.poll.options || []).map((o, idx) => `${idx + 1}. ${o.text}`),
      ].join("\n");
    }
    if (!textToCopy) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success(
        hasPoll ? "Poll copied to clipboard" : "Message copied to clipboard",
        { duration: 2000 },
      );
    } catch (err) {
      console.error("Failed to copy message:", err);
      toast.error("Failed to copy message");
    }
  };

  // Context menu position calculator
  const openMenu = () => {
    const bubble = bubbleRef.current;
    const dots = dotsRef.current;
    if (!bubble || !dots) return;

    const b = bubble.getBoundingClientRect();
    const d = dots.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const itemCount =
      (hasReply ? 1 : 0) +
      (hasCopy ? 1 : 0) +
      (canEdit ? 1 : 0) +
      (isOwn ? 1 : 0);

    const menuH = itemCount * 40 + 8;
    let top;
    let left;

    if (vw < MOBILE_BREAKPOINT) {
      left = (vw - MENU_W) / 2;
      top = b.top + b.height / 2 - menuH / 2;
    } else {
      left = d.right - MENU_W;
      top = d.bottom + 4;
      if (top + menuH > vh - 8) top = d.top - menuH - 4;
    }

    setMenuPos({
      top: clamp(top, 8, vh - menuH - 8),
      left: clamp(left, 8, vw - MENU_W - 8),
    });
    setShowMessageMenu(true);
  };

  const closeMenu = () => setShowMessageMenu(false);

  // Scrolls and highlights target quoted message
  const scrollToQuoted = (targetId) => {
    if (!targetId) return;
    const el = document.getElementById(`message-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/20", "dark:bg-primary/30");
      setTimeout(() => {
        el.classList.remove("bg-primary/20", "dark:bg-primary/30");
      }, 250);
    }
  };

  return (
    <div
      id={`message-${message._id}`}
      data-message-id={message._id}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
        transition: swipeOffset ? "none" : "transform 0.2s ease-out",
      }}
      className={cn(
        "relative mb-3 flex items-center gap-3 transition-colors duration-500",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {/* Mobile swipe reply indicator */}
      {swipeOffset > 10 && (
        <div
          style={{
            opacity: Math.min(swipeOffset / 35, 1),
            transform: `scale(${Math.min(0.6 + swipeOffset / 70, 1)})`,
          }}
          className="absolute -left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary/20 text-primary transition-opacity"
        >
          <Reply className="h-4 w-4" />
        </div>
      )}

      {showAvatar && (
        <Avatar
          src={message.sender.avatarUrl}
          name={message.sender.name}
          className="h-8 w-8 shrink-0 self-start text-xs"
        />
      )}

      <div
        className={cn(
          "flex max-w-[70%] flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2",
            isOwn ? "flex-row-reverse" : "flex-row",
          )}
        >
          {/* Main message bubble with corner tail */}
          <div
            ref={bubbleRef}
            className={cn(
              "group relative rounded-2xl px-4 py-2",
              isOwn && [
                "rounded-tr-none bg-primary text-primary-foreground",
                "before:absolute before:-right-2 before:top-0",
                "before:h-3 before:w-2 before:bg-primary",
                "before:[clip-path:polygon(0_0,100%_0,0_100%)]",
              ],
              !isOwn && [
                "rounded-tl-none bg-secondary text-secondary-foreground",
                "before:absolute before:-left-2 before:top-0",
                "before:h-3 before:w-2 before:bg-secondary",
                "before:[clip-path:polygon(0_0,100%_0,100%_100%)]",
              ],
              !isDeleted &&
                !isEditing &&
                (isOwn || message.text || message.media) &&
                "pr-8",
              isDeleted && "opacity-60",
            )}
          >
            {/* Options menu trigger */}
            {!isDeleted &&
              !isEditing &&
              (isOwn || message.text || message.media) && (
                <div className="absolute right-1 top-1 z-10">
                  <button
                    ref={dotsRef}
                    type="button"
                    onClick={() =>
                      showMessageMenu ? closeMenu() : openMenu()
                    }
                    aria-label="Message options"
                    aria-expanded={showMessageMenu}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full transition-opacity duration-150",
                      isOwn
                        ? "text-primary-foreground/80 hover:bg-black/15 hover:text-primary-foreground"
                        : "text-secondary-foreground/80 hover:bg-black/10 hover:text-secondary-foreground dark:hover:bg-white/10",
                      "opacity-100 md:opacity-0 md:group-hover:opacity-100",
                      "focus-visible:opacity-100",
                      showMessageMenu &&
                        (isOwn
                          ? "bg-black/15 md:opacity-100"
                          : "bg-black/10 md:opacity-100 dark:bg-white/10"),
                    )}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  <MessageOptionsMenu
                    open={showMessageMenu}
                    position={menuPos}
                    isOwn={isOwn}
                    canEdit={canEdit}
                    hasCopy={hasCopy}
                    hasReply={hasReply}
                    onReply={handleReply}
                    onCopy={copyMessageText}
                    onEdit={startEdit}
                    onDelete={handleDeleteClick}
                    onClose={closeMenu}
                  />
                </div>
              )}

            {!isOwn && !isDeleted && (
              <p className="mb-0.5 text-xs font-semibold opacity-70">
                {message.sender.name}
              </p>
            )}

            {isDeleted ? (
              <p className="flex items-center gap-1.5 text-sm italic opacity-80">
                <Trash2 className="h-3.5 w-3.5" />
                This message was deleted
              </p>
            ) : isEditing ? (
              <MessageEditForm
                value={editText}
                onChange={setEditText}
                onKeyDown={handleEditKeyDown}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : (
              <>
                {undecryptable ? (
                  <p className="flex items-center gap-1.5 text-sm italic opacity-80">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    {message.decrypt === "other-device"
                      ? "Sent before this device was set up. Restore your backup in Profile to read it."
                      : message.decrypt === "not-recipient"
                        ? "Sent before you joined this chat"
                        : "Couldn't decrypt this message"}
                  </p>
                ) : (
                  <>
                    <QuotedMessagePreview
                      replyTo={message.replyTo}
                      isOwn={isOwn}
                      onScrollToQuoted={scrollToQuoted}
                    />

                    {message.media && (
                      <MediaAttachment media={message.media} isOwn={isOwn} />
                    )}

                    {hasPoll && (
                      <PollBubble
                        poll={message.poll}
                        messageId={message._id}
                        currentUserId={currentUserId}
                        onVote={(selectedOptionIds) =>
                          onVote?.(message._id, selectedOptionIds)
                        }
                        isOwn={isOwn}
                      />
                    )}

                    {message.text && !message.media && !hasPoll && (
                      <LinkPreviewCard
                        url={extractFirstUrl(message.text)}
                        isOwn={isOwn}
                      />
                    )}

                    {message.text && (
                      <FormattedMessageText
                        text={message.text}
                        isOwn={isOwn}
                      />
                    )}
                  </>
                )}

                {/* Timestamp and delivery ticks */}
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
                  {message.encrypted && (
                    <Lock
                      className="h-3 w-3 opacity-60"
                      aria-label="End-to-end encrypted"
                    />
                  )}
                  {message.editedAt && (
                    <span className="opacity-60">(edited)</span>
                  )}
                  <span className="opacity-60">{time}</span>
                  {isOwn && (
                    <Ticks status={getStatus(message, recipientCount)} />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Quick emoji reaction button */}
          {!isDeleted && !isEditing && (
            <div ref={quickBarWrapRef} className="relative shrink-0">
              <button
                type="button"
                onClick={toggleQuickBar}
                aria-label={showQuickBar ? "Close reactions" : "Open reactions"}
                aria-expanded={showQuickBar}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  "border border-border bg-background/90 shadow-sm",
                  "text-muted-foreground transition-all duration-150",
                  "hover:bg-muted hover:text-foreground active:scale-95",
                  showQuickBar && "bg-muted text-foreground",
                )}
              >
                <Smile className="h-4 w-4" />
              </button>

              {showQuickBar && (
                <QuickReactBar
                  isOwn={isOwn}
                  mobileTop={quickBarTop}
                  onPick={handlePick}
                  onOpenFullPicker={handleOpenFullPicker}
                />
              )}
            </div>
          )}

          {isEditing && (
            <button
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel editing"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Reaction badge pills below bubble */}
        <ReactionPills
          reactions={message.reactions}
          currentUserId={currentUserId}
          onToggle={handlePick}
        />
      </div>

      {/* Full emoji picker modal */}
      {showFullPicker && (
        <Suspense fallback={null}>
          <EmojiPickerPopover
            onOpenChange={setShowFullPicker}
            onPick={handlePick}
          />
        </Suspense>
      )}
    </div>
  );
}
