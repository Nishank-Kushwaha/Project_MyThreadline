import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function QuickReactBar({ isOwn, onPick, onOpenFullPicker }) {
  return (
    <div
      className={cn(
        // Mobile: centered horizontally, at the message's vertical middle
        "absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        // Laptop (md+): above the smile button, left or right
        "md:top-auto md:bottom-full md:mb-2 md:translate-x-0 md:translate-y-0",
        isOwn ? "md:left-auto md:right-0" : "md:left-0 md:right-auto",
        "flex items-center gap-0.5",
        "rounded-full border border-border",
        "bg-card px-1.5 py-1",
        "shadow-lg",
        "whitespace-nowrap",
      )}
    >
      {" "}
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className={cn(
            "flex h-8 w-8 items-center justify-center",
            "rounded-full text-lg",
            "transition-transform duration-100",
            "hover:scale-125 hover:bg-muted",
            "active:scale-95",
          )}
          aria-label={`React ${emoji}`}
        >
          {" "}
          {emoji}{" "}
        </button>
      ))}{" "}
      <button
        type="button"
        onClick={onOpenFullPicker}
        className={cn(
          "flex h-8 w-8 items-center justify-center",
          "rounded-full",
          "text-muted-foreground",
          "transition-colors",
          "hover:bg-muted hover:text-foreground",
          "active:scale-95",
        )}
        aria-label="More reactions"
      >
        {" "}
        <Plus className="h-4 w-4" />{" "}
      </button>{" "}
    </div>
  );
}
