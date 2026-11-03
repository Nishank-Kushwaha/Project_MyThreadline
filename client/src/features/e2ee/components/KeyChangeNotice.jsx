import React from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function describe(change) {
  const parts = [];

  if (change.added?.length) {
    parts.push(
      change.added.length === 1
        ? "A new device was added"
        : `${change.added.length} new devices were added`,
    );
  }
  if (change.replaced?.length) {
    parts.push(
      change.replaced.length === 1
        ? "A device key was replaced"
        : `${change.replaced.length} device keys were replaced`,
    );
  }

  return parts.join(". ");
}

// One amber line per verified contact whose keys changed.
export function KeyChangeNotice({ changes, onReview }) {
  if (changes.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {changes.map((change) => (
        <div
          key={change.userId}
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />

          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {change.name}'s security code changed.
            </span>{" "}
            <span className="text-muted-foreground">{describe(change)}.</span>
          </p>

          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            onClick={() => onReview(change.userId)}
          >
            Review
          </Button>
        </div>
      ))}
    </div>
  );
}
