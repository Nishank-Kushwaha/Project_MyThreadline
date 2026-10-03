import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCheck,
  Smile,
  Pencil,
  Trash2,
  X as XIcon,
  MoreVertical,
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

// Message options menu size (w-44 = 176px; two rows + padding ≈ 88px)
const MENU_W = 176;
const MENU_H = 88;
const MOBILE_BREAKPOINT = 640;

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

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
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [quickBarTop, setQuickBarTop] = useState(null);

  const quickBarTimer = useRef(null);
  const bubbleRef = useRef(null);
  const dotsRef = useRef(null);
  const quickBarWrapRef = useRef(null);

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

    const b = bubbleRef.current?.getBoundingClientRect();
    if (b && window.innerWidth < 768) {
      setQuickBarTop(clamp(b.top + b.height / 2, 28, window.innerHeight - 28));
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
  // MESSAGE OPTIONS MENU (rendered in a portal, fixed position)
  // Mobile  : centered horizontally on screen, vertically centered
  //           on the message bubble it came from.
  // Desktop : right-aligned under the three dots (flips above if no room).
  // --------------------------------------------------

  const openMenu = () => {
    const bubble = bubbleRef.current;
    const dots = dotsRef.current;
    if (!bubble || !dots) return;

    const b = bubble.getBoundingClientRect();
    const d = dots.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top;
    let left;

    if (vw < MOBILE_BREAKPOINT) {
      left = (vw - MENU_W) / 2;
      top = b.top + b.height / 2 - MENU_H / 2;
    } else {
      left = d.right - MENU_W;
      top = d.bottom + 4;
      if (top + MENU_H > vh - 8) top = d.top - MENU_H - 4;
    }

    setMenuPos({
      top: clamp(top, 8, vh - MENU_H - 8),
      left: clamp(left, 8, vw - MENU_W - 8),
    });
    setShowMessageMenu(true);
  };

  const closeMenu = () => setShowMessageMenu(false);

  // --------------------------------------------------
  // Close the quick bar when clicking/tapping outside it
  // --------------------------------------------------
  useEffect(() => {
    if (!showQuickBar) return;

    const handleOutside = (e) => {
      // clicks on the smile button or inside the bar are handled by themselves
      if (quickBarWrapRef.current?.contains(e.target)) return;
      clearTimeout(quickBarTimer.current);
      setShowQuickBar(false);
    };

    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [showQuickBar]);

  // --------------------------------------------------
  // Close the menu if the window is resized / rotated
  // --------------------------------------------------
  useEffect(() => {
    if (!showMessageMenu) return;
    window.addEventListener("resize", closeMenu);
    return () => window.removeEventListener("resize", closeMenu);
  }, [showMessageMenu]);

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
        "relative mb-3 flex items-center gap-3",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
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
          {/* ---------- MESSAGE BUBBLE WITH TAIL ---------- */}
          <div
            ref={bubbleRef}
            className={cn(
              "group relative px-4 py-2 rounded-2xl",

              // Sender: square top-right corner + tail pointing out to the right
              isOwn && [
                "rounded-tr-none bg-primary text-primary-foreground",
                "before:absolute before:-right-2 before:top-0",
                "before:h-3 before:w-2 before:bg-primary",
                "before:[clip-path:polygon(0_0,100%_0,0_100%)]",
                // leave room for the dots so they don't cover text
                !isDeleted && !isEditing && "pr-8",
              ],

              // Receiver: square top-left corner + tail pointing out to the left
              !isOwn && [
                "rounded-tl-none bg-secondary text-secondary-foreground",
                "before:absolute before:-left-2 before:top-0",
                "before:h-3 before:w-2 before:bg-secondary",
                "before:[clip-path:polygon(0_0,100%_0,100%_100%)]",
              ],

              isDeleted && "opacity-60",
            )}
          >
            {/* ---------- THREE DOTS INSIDE BUBBLE (OWN ONLY) ---------- */}
            {isOwn && !isDeleted && !isEditing && (
              <div className="absolute right-1 top-1 z-10">
                <button
                  ref={dotsRef}
                  type="button"
                  onClick={() => (showMessageMenu ? closeMenu() : openMenu())}
                  aria-label="Message options"
                  aria-expanded={showMessageMenu}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full",
                    "text-primary-foreground/80 transition-opacity duration-150",
                    "hover:bg-black/15 hover:text-primary-foreground",
                    // visible on hover (desktop), always on touch screens
                    "opacity-100 md:opacity-0 md:group-hover:opacity-100",
                    "focus-visible:opacity-100",
                    showMessageMenu && "md:opacity-100 bg-black/15",
                  )}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {showMessageMenu &&
                  menuPos &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-100 max-sm:bg-black/30"
                      onClick={closeMenu}
                    >
                      <div
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          top: menuPos.top,
                          left: menuPos.left,
                          width: MENU_W,
                        }}
                        className="fixed rounded-xl border border-border bg-background p-1 text-foreground shadow-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeMenu();
                            startEdit();
                          }}
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                          <span>Edit message</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeMenu();
                            handleDeleteClick();
                          }}
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete message</span>
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}
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

          {/* ---------- EMOJI BUTTON (unchanged position) ---------- */}
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

        <ReactionPills
          reactions={message.reactions}
          currentUserId={currentUserId}
          onToggle={handlePick}
        />
      </div>

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
