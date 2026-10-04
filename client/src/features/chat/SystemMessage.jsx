import React from "react";

// Wording depends on who's looking: "You added Bob" vs "Alice added Bob".
export function getSystemText(system, currentUserId) {
  const { kind, actorId, actorName, targetId, targetName, meta } = system;

  const actor = actorId === currentUserId ? "You" : actorName || "Someone";
  const targetIsMe = targetId === currentUserId;
  const target = targetIsMe ? "you" : targetName || "someone";

  switch (kind) {
    case "group-created":
      return `${actor} created group "${meta?.newName}"`;
    case "name-changed":
      return `${actor} changed the group name from "${meta?.oldName}" to "${meta?.newName}"`;
    case "avatar-changed":
      return `${actor} changed this group's icon`;
    case "avatar-removed":
      return `${actor} deleted this group's icon`;
    case "member-added":
      return `${actor} added ${target}`;
    case "member-removed":
      return `${actor} removed ${target}`;
    case "member-promoted":
      return `${actor} made ${target} an admin`;
    case "member-demoted":
      return `${actor} dismissed ${target} as an admin`;
    case "creator-transferred":
      return `${actor} made ${target} the group creator`;
    case "creator-auto-transferred":
      return targetIsMe
        ? "You're now the group creator"
        : `${target} is now the group creator`;
    case "member-left":
      return `${actor} left`;
    case "member-auto-promoted":
      return targetIsMe ? "You're now an admin" : `${target} is now an admin`;
    default:
      return null;
  }
}

export function SystemMessage({ message, currentUserId }) {
  // Falls back to the server's neutral sentence for unknown kinds.
  const text =
    (message.system && getSystemText(message.system, currentUserId)) ||
    message.text;

  return (
    <div className="mb-3 flex justify-center">
      <p className="max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground wrap-break-word">
        {text}
      </p>
    </div>
  );
}
