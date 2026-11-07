import React from "react";
import { Lock, ShieldAlert } from "lucide-react";

// Formats member names into a natural readable list
function formatPendingNames(names) {
  if (names.length === 1) return `${names[0]} hasn't`;
  if (names.length === 2) return `${names[0]} and ${names[1]} haven't`;
  const othersCount = names.length - 2;
  return `${names[0]}, ${names[1]} and ${othersCount} other${othersCount > 1 ? "s" : ""} haven't`;
}

// Resolves encryption state notice message
function getNoticeText(kind, { name, names, isGroup }) {
  switch (kind) {
    case "active":
      return isGroup
        ? "Messages in this group are end-to-end encrypted. Only members of the group can read them."
        : `Messages in this chat are end-to-end encrypted. Only you and ${name} can read them.`;
    case "pending":
      return names.length > 0
        ? `${formatPendingNames(names)} set up encryption yet, so messages aren't encrypted for now.`
        : "Encryption isn't set up on this device yet, so messages aren't encrypted for now.";
    case "started":
      return "End-to-end encryption starts here. Earlier messages weren't encrypted.";
    default:
      return "";
  }
}

export function EncryptionNotice({ kind, name, names = [], isGroup = false }) {
  // Derived notice content and icon
  const message = getNoticeText(kind, { name, names, isGroup });
  const Icon = kind === "pending" ? ShieldAlert : Lock;

  if (!message) return null;

  return (
    <div className="mb-3 flex justify-center">
      <p className="flex max-w-[90%] items-start gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
        <Icon className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{message}</span>
      </p>
    </div>
  );
}
