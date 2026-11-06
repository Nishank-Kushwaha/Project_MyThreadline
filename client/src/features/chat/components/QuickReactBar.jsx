import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Individual emoji reaction button with hover zoom animation
function QuickReactionButton({ emoji, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(emoji)}
      title={`React ${emoji}`}
      aria-label={`React ${emoji}`}
      className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform duration-100 hover:scale-125 hover:bg-muted active:scale-95"
    >
      {emoji}
    </button>
  );
}

// Floating quick reaction bar supporting preset emojis and a trigger for full picker
export function QuickReactBar({
  isOwn,
  mobileTop,
  onPick,
  onOpenFullPicker,
}) {
  return (
    <div
      style={{ "--bar-top": `${mobileTop ?? 0}px` }}
      className={cn(
        "fixed left-1/2 top-(--bar-top) z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border border-border bg-card px-1.5 py-1 shadow-lg",
        "md:absolute md:bottom-full md:top-auto md:mb-2 md:translate-x-0 md:translate-y-0",
        isOwn ? "md:left-auto md:right-0" : "md:left-0 md:right-auto",
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <QuickReactionButton key={emoji} emoji={emoji} onPick={onPick} />
      ))}

      {/* Button to open full emoji picker modal */}
      <button
        type="button"
        onClick={onOpenFullPicker}
        title="More reactions"
        aria-label="More reactions"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
