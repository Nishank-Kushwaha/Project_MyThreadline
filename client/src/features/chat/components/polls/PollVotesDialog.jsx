import React from "react";
import { Check, Users } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  aggregatePollVotes,
  votePercentage,
} from "@/features/chat/lib/pollUtils";

// Time of day, e.g. 09:36 AM
function formatVoteTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Poll results: per-option percentage, bar and who voted when
export function PollVotesDialog({ open, onOpenChange, poll, currentUserId }) {
  if (!poll) return null;

  const { question, options = [], allowMultipleAnswers } = poll;
  const { votersByOption, totalVoters } = aggregatePollVotes(
    poll,
    currentUserId,
  );

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Poll Results
            </span>
          </div>
          <h2 className="text-base font-semibold leading-snug text-foreground">
            {question}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalVoters} {totalVoters === 1 ? "person voted" : "people voted"}
            {allowMultipleAnswers
              ? " • Multiple answers allowed"
              : " • Single choice"}
          </p>
        </div>

        <div className="max-h-80 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {options.map((opt) => {
            const voters = votersByOption.get(opt.id) || [];
            const voteCount = voters.length;
            const percentage = votePercentage(voteCount, totalVoters);

            return (
              <div
                key={opt.id}
                className="space-y-2.5 rounded-lg border border-border bg-card p-3 shadow-xs"
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="text-foreground">{opt.text}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {percentage}%
                    </span>
                    <span>
                      ({voteCount} {voteCount === 1 ? "vote" : "votes"})
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {voters.length > 0 ? (
                  <div className="divide-y divide-border/50 pt-1">
                    {voters.map((voter) => (
                      <div
                        key={voter.id}
                        className="flex items-center justify-between py-1.5 first:pt-1 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar
                            src={voter.avatarUrl}
                            name={voter.name}
                            className="h-6 w-6 text-[10px]"
                          />
                          <span className="text-xs font-medium text-foreground">
                            {voter.name}
                            {voter.isMe && (
                              <span className="ml-1 text-[11px] text-primary">
                                (You)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {formatVoteTime(voter.updatedAt)}
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pt-0.5 text-[11px] italic text-muted-foreground">
                    No votes yet
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-border pt-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
