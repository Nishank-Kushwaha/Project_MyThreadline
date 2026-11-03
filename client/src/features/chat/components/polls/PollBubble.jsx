import React, { useState } from "react";
import { Check, Circle, CheckSquare, Square, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PollVotesDialog } from "./PollVotesDialog";
import { cn } from "@/lib/utils";

export function PollBubble({
  poll,
  messageId,
  currentUserId,
  onVote,
  isOwn = false,
}) {
  const [isVotesDialogOpen, setIsVotesDialogOpen] = useState(false);

  if (!poll || !poll.question) return null;

  const {
    question = "",
    options = [],
    allowMultipleAnswers = false,
    votes = [],
  } = poll;

  // Aggregate votes per option and find current user's votes
  const optionVotersMap = new Map();
  options.forEach((opt) => optionVotersMap.set(opt.id, []));

  const mySelectedOptionIds = new Set();
  const uniqueVoterIds = new Set();

  votes.forEach((v) => {
    const voter = v.userId;
    const voterId = String(voter?._id || voter?.id || voter);
    const selectedIds = v.selectedOptionIds || [];

    if (selectedIds.length > 0) {
      uniqueVoterIds.add(voterId);
    }

    const isMe = voterId === String(currentUserId);
    if (isMe) {
      selectedIds.forEach((id) => mySelectedOptionIds.add(id));
    }

    selectedIds.forEach((optId) => {
      if (optionVotersMap.has(optId)) {
        optionVotersMap.get(optId).push({
          id: voterId,
          name: voter?.name || "Someone",
          avatarUrl: voter?.avatarUrl || voter?.avatar || null,
        });
      }
    });
  });

  const totalVotersCount = uniqueVoterIds.size;

  const handleOptionClick = (optionId) => {
    if (!onVote) return;

    let newSelected;
    if (allowMultipleAnswers) {
      // Toggle selection in multi-choice
      newSelected = new Set(mySelectedOptionIds);
      if (newSelected.has(optionId)) {
        newSelected.delete(optionId);
      } else {
        newSelected.add(optionId);
      }
    } else {
      // Single choice: toggle off if clicking selected, else pick only this option
      if (mySelectedOptionIds.has(optionId)) {
        newSelected = new Set();
      } else {
        newSelected = new Set([optionId]);
      }
    }

    onVote(Array.from(newSelected));
  };

  return (
    <div className="w-full min-w-65 max-w-sm space-y-3 py-1">
      {/* Poll Header */}
      <div className="space-y-0.5">
        <h3 className="text-[15px] font-semibold leading-snug text-foreground wrap-break-word">
          {question}
        </h3>
        <p className="text-[11px] font-medium text-muted-foreground">
          {allowMultipleAnswers ? "Select one or more" : "Select one"}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((opt) => {
          const voters = optionVotersMap.get(opt.id) || [];
          const voteCount = voters.length;
          const isSelected = mySelectedOptionIds.has(opt.id);
          const percentage =
            totalVotersCount > 0
              ? Math.round((voteCount / totalVotersCount) * 100)
              : 0;

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
              {/* Progress Bar background */}
              {percentage > 0 && (
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none",
                    isSelected ? "bg-primary/15" : "bg-muted/70",
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}

              {/* Option Content */}
              <div className="relative z-10 flex w-full items-center justify-between gap-3 p-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Radio / Checkbox Indicator */}
                  <div className="shrink-0 text-muted-foreground group-hover:text-foreground">
                    {allowMultipleAnswers ? (
                      isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary fill-primary/10" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )
                    ) : isSelected ? (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                      </div>
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>

                  {/* Option Label */}
                  <span
                    className={cn(
                      "text-xs font-medium leading-relaxed wrap-break-word line-clamp-2",
                      isSelected
                        ? "text-foreground font-semibold"
                        : "text-foreground/90",
                    )}
                  >
                    {opt.text}
                  </span>
                </div>

                {/* Right side: Voter mini-avatars + Count */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {voters.length > 0 && (
                    <div className="flex -space-x-1.5 overflow-hidden">
                      {voters.slice(0, 3).map((v, i) => (
                        <Avatar
                          key={v.id + i}
                          src={v.avatarUrl}
                          name={v.name}
                          className="h-4 w-4 ring-1 ring-background text-[8px]"
                        />
                      ))}
                      {voters.length > 3 && (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold ring-1 ring-background text-muted-foreground">
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

      {/* Footer / View Votes Link */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
        <span>
          {totalVotersCount} {totalVotersCount === 1 ? "vote" : "votes"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsVotesDialogOpen(true);
          }}
          className="flex items-center gap-0.5 font-semibold text-primary hover:underline"
        >
          View votes
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Detail Modal */}
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
