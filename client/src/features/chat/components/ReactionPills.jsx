import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn, resolveAvatarUrl } from "@/lib/utils";

// Groups message reactions by emoji and correlates user details
function groupReactions(reactions, currentUserId) {
  const groups = new Map();

  for (const reaction of reactions) {
    const user = reaction.userId;
    const userId = user?._id || user?.id || user;
    const name = user?.name || "Someone";
    const avatar =
      user?.avatarUrl ||
      user?.avatar ||
      user?.profilePicture ||
      user?.profilePic ||
      user?.photoURL ||
      null;
    const isMine = String(userId) === String(currentUserId);

    if (!groups.has(reaction.emoji)) {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 0,
        mine: false,
        users: [],
      });
    }

    const group = groups.get(reaction.emoji);
    group.count += 1;
    group.mine = group.mine || isMine;

    group.users.push({
      id: userId,
      name: isMine ? "You" : name,
      avatar,
      emoji: reaction.emoji,
      isMine,
    });
  }

  return [...groups.values()];
}

// Avatar circle for reaction user: displays avatar image if available, otherwise letter initial
function ReactionAvatar({ user, size = "md" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  const initial = user?.name?.charAt(0)?.toUpperCase() || "?";

  const rawAvatar = user?.avatar;
  const avatarUrl = rawAvatar ? resolveAvatarUrl(rawAvatar) : null;

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={user.name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", sizeClass)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
        sizeClass,
      )}
      aria-label={user?.name}
    >
      {initial}
    </div>
  );
}

// Modal dialog displaying full list of reaction emojis and participating users
function ReactionDialog({ groups, onClose }) {
  const [activeEmoji, setActiveEmoji] = useState(groups[0]?.emoji || null);

  const activeGroup = groups.find((group) => group.emoji === activeEmoji);
  const totalCount = groups.reduce((total, group) => total + group.count, 0);

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {/* Header with count and dismiss button */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Reactions</h2>
            <p className="text-xs text-muted-foreground">
              {totalCount} {totalCount === 1 ? "reaction" : "reactions"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close reactions"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Reaction emoji filter tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
          {groups.map((group) => {
            const active = group.emoji === activeEmoji;
            return (
              <button
                key={group.emoji}
                type="button"
                onClick={() => setActiveEmoji(group.emoji)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{group.emoji}</span>
                <span className="text-xs">{group.count}</span>
              </button>
            );
          })}
        </div>

        {/* User roster for the active emoji */}
        <div className="overflow-y-auto p-2">
          {activeGroup?.users.map((user, index) => (
            <div
              key={`${user.id}-${index}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-muted"
            >
              <ReactionAvatar user={user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
              </div>
              <span className="text-xl">{user.emoji}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact WhatsApp-style reaction summary pill placed directly below message bubbles
export function ReactionPills({ reactions, currentUserId, onToggle }) {
  const [showDialog, setShowDialog] = useState(false);

  const groups = useMemo(
    () => groupReactions(reactions, currentUserId),
    [reactions, currentUserId],
  );

  if (!reactions || reactions.length === 0) return null;

  // Sort by highest count first, showing top 5 emojis
  const sortedGroups = [...groups].sort((a, b) => b.count - a.count);
  const visibleGroups = sortedGroups.slice(0, 5);
  const hiddenGroupCount = Math.max(0, sortedGroups.length - 5);
  const totalReactionCount = reactions.length;

  return (
    <>
      <div className="mt-1 flex max-w-full items-center">
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          aria-label={`View ${totalReactionCount} reactions`}
          className="flex max-w-full items-center rounded-full border border-border bg-background px-1.5 py-0.5 shadow-xs transition-colors hover:bg-muted active:scale-[0.98]"
        >
          {/* Top 5 reaction emojis */}
          <div className="flex items-center">
            {visibleGroups.map((group, index) => (
              <span
                key={group.emoji}
                title={`${group.count} ${group.emoji} reactions`}
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center text-sm leading-none",
                  index > 0 && "-ml-0.5",
                )}
              >
                {group.emoji}
              </span>
            ))}
          </div>

          {/* Total reaction counter */}
          {totalReactionCount > 0 && (
            <span className="ml-1 px-1 text-[11px] font-medium text-muted-foreground">
              {totalReactionCount}
            </span>
          )}

          {/* Indicator for additional emoji types beyond top 5 */}
          {hiddenGroupCount > 0 && (
            <span className="ml-0.5 pr-1 text-[10px] text-muted-foreground">
              +{hiddenGroupCount}
            </span>
          )}
        </button>
      </div>

      {/* Full reactions modal dialog */}
      {showDialog && (
        <ReactionDialog
          groups={sortedGroups}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
