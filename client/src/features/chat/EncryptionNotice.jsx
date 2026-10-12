import React from "react";
import { Lock, ShieldAlert } from "lucide-react";

function formatNames(names) {
  if (names.length === 1) return `${names[0]} hasn't`;
  if (names.length === 2) return `${names[0]} and ${names[1]} haven't`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 > 1 ? "s" : ""} haven't`;
}

export function EncryptionNotice({ kind, name, names = [], isGroup = false }) {
  const notices = {
    active: isGroup
      ? "Messages in this group are end-to-end encrypted. Only members of the group can read them."
      : `Messages in this chat are end-to-end encrypted. Only you and ${name} can read them.`,
    pending:
      names.length > 0
        ? `${formatNames(names)} set up encryption yet, so messages aren't encrypted for now.`
        : "Encryption isn't set up on this device yet, so messages aren't encrypted for now.",
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
