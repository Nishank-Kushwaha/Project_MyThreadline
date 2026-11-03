import React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";

function formatVoteTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PollVotesDialog({
  open,
  onOpenChange,
  poll,
  currentUserId,
}) {
  if (!poll) return null;

  const { question, options = [], votes = [] } = poll;

  // Aggregate votes per option
  const optionVotersMap = new Map();
  options.forEach((opt) => optionVotersMap.set(opt.id, []));

  let totalVotersCount = 0;
  const uniqueVoterIds = new Set();

  votes.forEach((v) => {
    const voter = v.userId;
    const voterId = String(voter?._id || voter?.id || voter);
    const selectedIds = v.selectedOptionIds || [];

    if (selectedIds.length > 0) {
      uniqueVoterIds.add(voterId);
    }

    selectedIds.forEach((optId) => {
      if (optionVotersMap.has(optId)) {
        optionVotersMap.get(optId).push({
          id: voterId,
          name: voter?.name || "Someone",
          avatarUrl: voter?.avatarUrl || voter?.avatar || null,
          updatedAt: v.updatedAt,
          isMe: voterId === String(currentUserId),
        });
      }
    });
  });

  totalVotersCount = uniqueVoterIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        {/* Header */}
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Poll Results
            </span>
          </div>
          <h2 className="text-base font-semibold text-foreground leading-snug">
            {question}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalVotersCount} {totalVotersCount === 1 ? "person voted" : "people voted"}
            {poll.allowMultipleAnswers ? " • Multiple answers allowed" : " • Single choice"}
          </p>
        </div>

        {/* Options Breakdown */}
        <div className="max-h-80 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {options.map((opt) => {
            const voters = optionVotersMap.get(opt.id) || [];
            const voteCount = voters.length;
            const percentage =
              totalVotersCount > 0
                ? Math.round((voteCount / totalVotersCount) * 100)
                : 0;

            return (
              <div
                key={opt.id}
                className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-xs"
              >
                {/* Option Header */}
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

                {/* Mini progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* Voters List */}
                {voters.length > 0 ? (
                  <div className="pt-1 divide-y divide-border/50">
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
                  <p className="text-[11px] italic text-muted-foreground pt-0.5">
                    No votes yet
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
