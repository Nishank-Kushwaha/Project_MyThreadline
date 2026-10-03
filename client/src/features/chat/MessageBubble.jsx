import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Smile,
  Pencil,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickReactBar } from "./QuickReactBar";
import { ReactionPills } from "./ReactionPills";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

// Code-split: emoji-picker-react's emoji dataset only downloads when
// someone actually opens the picker.
const EmojiPickerPopover = lazy(() =>
  import("./EmojiPickerPopover").then((m) => ({
    default: m.EmojiPickerPopover,
  })),
);

const QUICK_BAR_DURATION = 3000;

// recipientCount = everyone in the room except the sender.
// A message only counts as delivered/seen once ALL recipients have it.
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

export function MessageBubble({
  message,
  isOwn,
  isGroup,
  recipientCount,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
}) {
  const [showQuickBar, setShowQuickBar] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);

  const quickBarTimer = useRef(null);
  const isDeleted = !!message.deletedAt;

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Only shown in groups, and only on OTHER people's messages — in a private
  // chat there are only two people, so the header photo already answers
  // "who am I talking to" without repeating it on every bubble.
  const showAvatar = isGroup && !isOwn;

  // --------------------------------------------------
  // QUICK BAR TIMER
  // --------------------------------------------------

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

  // --------------------------------------------------
  // OPEN / CLOSE QUICK BAR
  // --------------------------------------------------

  const toggleQuickBar = () => {
    if (showQuickBar) {
      clearQuickBarTimer();
      setShowQuickBar(false);
      return;
    }

    setShowQuickBar(true);
    startQuickBarTimer();
  };

  // --------------------------------------------------
  // PICK QUICK REACTION
  // --------------------------------------------------

  const handlePick = (emoji) => {
    clearQuickBarTimer();

    onReact(message._id, emoji);

    setShowQuickBar(false);
  };

  // --------------------------------------------------
  // OPEN FULL EMOJI PICKER
  // --------------------------------------------------

  const handleOpenFullPicker = () => {
    clearQuickBarTimer();

    setShowQuickBar(false);

    setShowFullPicker(true);
  };

  // --------------------------------------------------
  // EDIT / DELETE MESSAGE
  // --------------------------------------------------

  const startEdit = () => {
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

  const handleDeleteClick = () => {
    if (window.confirm("Delete this message? This can't be undone.")) {
      onDelete(message._id);
    }
  };

  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      clearQuickBarTimer();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative mb-3 flex items-center gap-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {/* ----------------------------------------------
        PROFILE PHOTO AS AVATAR
      ----------------------------------------------- */}

      {showAvatar && (
        <Avatar
          src={message.sender.avatarUrl}
          name={message.sender.name}
          className="h-8 w-8 shrink-0 self-start text-xs"
        />
      )}

      {/* Column: [bubble + action buttons] row on top, reaction pills below —
          kept as TWO separate rows so the action buttons center against the
          BUBBLE's height only, not the bubble+pills total. */}

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
          <div
            className={cn(
              "rounded-2xl px-4 py-2",
              isOwn
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
              isDeleted && "opacity-60",
            )}
          >
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
              <div className="flex min-w-45 flex-col gap-2">
                <Input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  className="h-8 border-foreground/20 bg-background/20 text-sm text-inherit placeholder:text-inherit/60"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-md px-2 py-1 text-xs opacity-80 hover:bg-black/10 hover:opacity-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded-md bg-black/15 px-2 py-1 text-xs font-medium hover:bg-black/25"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap wrap-break-word text-sm">
                  {message.text}
                </p>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
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

          {!isDeleted && !isEditing && (
            <div className="flex shrink-0 items-center gap-1">
              {isOwn && (
                <>
                  <button
                    type="button"
                    onClick={startEdit}
                    aria-label="Edit message"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95",
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    aria-label="Delete message"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-95",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={toggleQuickBar}
                  aria-label={
                    showQuickBar ? "Close reactions" : "Open reactions"
                  }
                  aria-expanded={showQuickBar}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95",
                    showQuickBar && "bg-muted text-foreground",
                  )}
                >
                  <Smile className="h-4 w-4" />
                </button>

                {showQuickBar && (
                  <QuickReactBar
                    isOwn={isOwn}
                    onPick={handlePick}
                    onOpenFullPicker={handleOpenFullPicker}
                  />
                )}
              </div>
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

        {/* Pills sit below the row, so they no longer affect the button's centering */}
        <ReactionPills
          reactions={message.reactions}
          currentUserId={currentUserId}
          onToggle={handlePick}
        />
      </div>

      {/* ----------------------------------------------
          FULL EMOJI PICKER
      ----------------------------------------------- */}

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
