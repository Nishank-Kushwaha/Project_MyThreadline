import React from "react";
import { Lock, ShieldAlert } from "lucide-react";

export function EncryptionNotice({ kind, name }) {
  const notices = {
    active: `Messages in this chat are end-to-end encrypted. Only you and ${name} can read them.`,
    pending: `${name} hasn't set up encryption yet, so messages aren't encrypted for now.`,
    started:
      "End-to-end encryption starts here. Earlier messages weren't encrypted.",
  };

  const Icon = kind === "pending" ? ShieldAlert : Lock;

  return (
    <div className="mb-3 flex justify-center">
      <p className="flex max-w-[90%] items-start gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
        <Icon className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{notices[kind]}</span>
      </p>
    </div>
  );
}
