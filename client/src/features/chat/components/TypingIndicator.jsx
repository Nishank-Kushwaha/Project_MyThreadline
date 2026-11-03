import React from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * WhatsApp-style in-chat Typing Indicator
 * Displays stacked avatar(s) of the active typers alongside
 * a speech bubble with staggered bouncing dots.
 */
export function TypingIndicator({ typers = [], isGroup = false }) {
  if (!typers || typers.length === 0) return null;

  // Max 3 avatars stacked
  const visibleTypers = typers.slice(0, 3);
  const extraCount = typers.length - visibleTypers.length;

  const namesLabel =
    typers.length === 1
      ? `${typers[0].name || "Someone"} is typing…`
      : typers.length === 2
        ? `${typers[0].name} and ${typers[1].name} are typing…`
        : `${typers[0].name}, ${typers[1].name} and others are typing…`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={namesLabel}
      title={namesLabel}
      className="relative mb-3 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none"
    >
      {/* Stacked circular avatars */}
      <div className="flex items-center shrink-0">
        {visibleTypers.map((typer, idx) => (
          <div
            key={typer.id || idx}
            style={{ zIndex: 10 - idx }}
            className={cn(
              "transition-transform",
              idx > 0 && "-ml-3",
            )}
          >
            <Avatar
              src={typer.avatarUrl}
              name={typer.name}
              className="h-7 w-7 text-[10px] font-semibold ring-2 ring-background shadow-xs"
            />
          </div>
        ))}

        {extraCount > 0 && (
          <div
            style={{ zIndex: 5 }}
            className="-ml-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted ring-2 ring-background text-[10px] font-bold text-muted-foreground shadow-xs"
          >
            +{extraCount}
          </div>
        )}
      </div>

      {/* WhatsApp-style incoming speech bubble with bouncing dots */}
      <div
        className={cn(
          "relative flex items-center px-4 py-2.5 rounded-2xl rounded-tl-none",
          "bg-secondary text-secondary-foreground shadow-xs border border-black/5 dark:border-white/10",
          // Bubble tail pointing left towards avatars
          "before:absolute before:-left-1.5 before:top-0",
          "before:h-3 before:w-1.5 before:bg-secondary",
          "before:[clip-path:polygon(0_0,100%_0,100%_100%)]",
        )}
      >
        <div className="flex items-center gap-1.5 py-0.5">
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/80 animate-bounce"
            style={{ animationDuration: "1.1s", animationDelay: "-0.32s" }}
          />
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/80 animate-bounce"
            style={{ animationDuration: "1.1s", animationDelay: "-0.16s" }}
          />
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/80 animate-bounce"
            style={{ animationDuration: "1.1s", animationDelay: "0s" }}
          />
        </div>
      </div>
    </div>
  );
}
