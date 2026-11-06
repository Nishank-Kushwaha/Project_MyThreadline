import React from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Formats descriptive label for active typers
function resolveTypersLabel(typers) {
  if (typers.length === 1) return `${typers[0].name || "Someone"} is typing…`;
  if (typers.length === 2) {
    return `${typers[0].name} and ${typers[1].name} are typing…`;
  }
  return `${typers[0].name}, ${typers[1].name} and others are typing…`;
}

// Stack of up to 3 overlapping avatars with overflow counter
function StackedTypingAvatars({ typers }) {
  const visibleTypers = typers.slice(0, 3);
  const extraCount = typers.length - visibleTypers.length;

  return (
    <div className="flex shrink-0 items-center">
      {visibleTypers.map((typer, idx) => (
        <div
          key={typer.id || idx}
          style={{ zIndex: 10 - idx }}
          className={cn("transition-transform", idx > 0 && "-ml-3")}
        >
          <Avatar
            src={typer.avatarUrl}
            name={typer.name}
            className="h-7 w-7 text-[10px] font-semibold shadow-xs ring-2 ring-background"
          />
        </div>
      ))}

      {extraCount > 0 && (
        <div
          style={{ zIndex: 5 }}
          className="-ml-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground shadow-xs ring-2 ring-background"
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
}

// Speech bubble with corner tail and staggered bouncing dots
function BouncingDotsBubble() {
  return (
    <div
      className={cn(
        "relative flex items-center rounded-2xl rounded-tl-none border border-black/5 bg-secondary px-4 py-2.5 text-secondary-foreground shadow-xs dark:border-white/10",
        "before:absolute before:-left-1.5 before:top-0 before:h-3 before:w-1.5 before:bg-secondary before:[clip-path:polygon(0_0,100%_0,100%_100%)]",
      )}
    >
      <div className="flex items-center gap-1.5 py-0.5">
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/80"
          style={{ animationDuration: "1.1s", animationDelay: "-0.32s" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/80"
          style={{ animationDuration: "1.1s", animationDelay: "-0.16s" }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/80"
          style={{ animationDuration: "1.1s", animationDelay: "0s" }}
        />
      </div>
    </div>
  );
}

// In-chat typing indicator displaying stacked avatar(s) and animated speech bubble
export function TypingIndicator({ typers = [], isGroup = false }) {
  if (!typers || typers.length === 0) return null;

  const namesLabel = resolveTypersLabel(typers);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={namesLabel}
      title={namesLabel}
      className="relative mb-3 flex select-none items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <StackedTypingAvatars typers={typers} />
      <BouncingDotsBubble />
    </div>
  );
}
