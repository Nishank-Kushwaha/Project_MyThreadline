import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickReactBar } from "./QuickReactBar";
import { ReactionPills } from "./ReactionPills";
import { Avatar } from "@/components/ui/avatar";

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
}) {
  const [showQuickBar, setShowQuickBar] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);

  const quickBarTimer = useRef(null);

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

      {/* 
        Message + reaction button

        OTHER USER:
        [ Message ] [ 🙂 ]

        OWN MESSAGE:
        [ 🙂 ] [ Message ]

        Therefore the button is always toward the
        inner/center side of the chat.
      */}

      <div
        className={cn(
          "flex min-w-0 max-w-[80%] flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {/* Row: bubble + reaction button, centered on the bubble only */}
        <div
          className={cn(
            "flex max-w-full items-center gap-2",
            isOwn ? "flex-row-reverse" : "flex-row",
          )}
        >
          <div
            className={cn(
              "min-w-0 rounded-2xl px-4 py-2",
              isOwn
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {!isOwn && (
              <p className="mb-0.5 text-xs font-semibold opacity-70">
                {message.sender.name}
              </p>
            )}

            <p className="whitespace-pre-wrap wrap-break-word text-sm">
              {message.text}
            </p>

            <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
              <span className="opacity-60">{time}</span>
              {isOwn && <Ticks status={getStatus(message, recipientCount)} />}
            </div>
          </div>

          <div className="shrink-0 md:relative">
            <button
              type="button"
              onClick={toggleQuickBar}
              aria-label={showQuickBar ? "Close reactions" : "Open reactions"}
              aria-expanded={showQuickBar}
              className={cn(
                "flex h-8 w-8 items-center justify-center",
                "rounded-full border border-border",
                "bg-background/90 shadow-sm",
                "text-muted-foreground",
                "transition-all duration-150",
                "hover:bg-muted hover:text-foreground",
                "active:scale-95",
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
