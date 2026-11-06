import React, { useState } from "react";
import { Circle, CheckSquare, Square, ChevronRight } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PollVotesDialog } from "./PollVotesDialog";
import {
  aggregatePollVotes,
  votePercentage,
} from "@/features/chat/lib/pollUtils";

// Radio or checkbox look, depending on whether multiple answers are allowed
function OptionIndicator({ multiple, selected }) {
  if (multiple) {
    return selected ? (
      <CheckSquare className="h-4 w-4 fill-primary/10 text-primary" />
    ) : (
      <Square className="h-4 w-4" />
    );
  }
  return selected ? (
    <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
    </div>
  ) : (
    <Circle className="h-4 w-4" />
  );
}

// Poll inside a chat bubble: tap an option to vote, "View votes" for details
export function PollBubble({
  poll,
  messageId,
  currentUserId,
  onVote,
  isOwn = false,
}) {
  const [isVotesDialogOpen, setIsVotesDialogOpen] = useState(false);

  if (!poll || !poll.question) return null;

  const { question = "", options = [], allowMultipleAnswers = false } = poll;
  const { votersByOption, mySelectedOptionIds, totalVoters } =
    aggregatePollVotes(poll, currentUserId);

  // Multi-choice toggles the option; single-choice switches to it (or clears if already picked)
  const handleOptionClick = (optionId) => {
    if (!onVote) return;

    let next;
    if (allowMultipleAnswers) {
      next = new Set(mySelectedOptionIds);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
    } else {
      next = mySelectedOptionIds.has(optionId)
        ? new Set()
        : new Set([optionId]);
    }

    onVote(Array.from(next));
  };

  const handleViewVotes = (e) => {
    e.stopPropagation();
    setIsVotesDialogOpen(true);
  };

  return (
    <div className="w-full min-w-65 max-w-sm space-y-3 py-1">
      <div className="space-y-0.5">
        <h3 className="wrap-break-word text-[15px] font-semibold leading-snug text-foreground">
          {question}
        </h3>
        <p className="text-[11px] font-medium text-muted-foreground">
          {allowMultipleAnswers ? "Select one or more" : "Select one"}
        </p>
      </div>

      <div className="space-y-2">
        {options.map((opt) => {
          const voters = votersByOption.get(opt.id) || [];
          const voteCount = voters.length;
          const isSelected = mySelectedOptionIds.has(opt.id);
          const percentage = votePercentage(voteCount, totalVoters);

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleOptionClick(opt.id)}
              className={cn(
                "group relative flex w-full flex-col overflow-hidden rounded-lg border text-left transition-all",
                isSelected
                  ? "border-primary/60 bg-primary/5 shadow-xs"
                  : "border-border/80 bg-card/60 hover:border-border hover:bg-muted/30",
              )}
            >
              {/* Vote share bar behind the row */}
              {percentage > 0 && (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 transition-all duration-300",
                    isSelected ? "bg-primary/15" : "bg-muted/70",
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative z-10 flex w-full items-center justify-between gap-3 p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="shrink-0 text-muted-foreground group-hover:text-foreground">
                    <OptionIndicator
                      multiple={allowMultipleAnswers}
                      selected={isSelected}
                    />
                  </div>

                  <span
                    className={cn(
                      "wrap-break-word line-clamp-2 text-xs font-medium leading-relaxed",
                      isSelected
                        ? "font-semibold text-foreground"
                        : "text-foreground/90",
                    )}
                  >
                    {opt.text}
                  </span>
                </div>

                {/* Voter avatars and count */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {voters.length > 0 && (
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {voters.slice(0, 3).map((v, i) => (
                        <Avatar
                          key={v.id + i}
                          src={v.avatarUrl}
                          name={v.name}
                          className="h-4 w-4 text-[8px] ring-1 ring-background"
                        />
                      ))}
                      {voters.length > 3 && (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground ring-1 ring-background">
                          +{voters.length - 3}
                        </div>
                      )}
                    </div>
                  )}

                  <span className="text-[11px] font-medium text-muted-foreground">
                    {voteCount}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
        <span>
          {totalVoters} {totalVoters === 1 ? "vote" : "votes"}
        </span>
        <button
          type="button"
          onClick={handleViewVotes}
          className="flex items-center gap-0.5 font-semibold text-primary hover:underline"
        >
          View votes
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {isVotesDialogOpen && (
        <PollVotesDialog
          open={isVotesDialogOpen}
          onOpenChange={setIsVotesDialogOpen}
          poll={poll}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
