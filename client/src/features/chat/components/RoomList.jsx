import React from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getSystemText } from "./SystemMessage";
import { ENCRYPTED_PREVIEW } from "@/features/e2ee/lib/messages";

// Resolves snippet text for the room's most recent message
function resolveRoomPreview(room, currentUserId, previews) {
  const lastMessage = room.lastMessage;
  if (lastMessage?.system) {
    return getSystemText(lastMessage.system, currentUserId);
  }
  if (lastMessage?.e2ee) {
    return previews[lastMessage.messageId] ?? ENCRYPTED_PREVIEW;
  }
  if (lastMessage?.text) {
    return lastMessage.text;
  }
  return room.type === "group" ? `${room.memberCount} members` : "Say hello";
}

// Individual conversation item row with avatar, online indicator, unread badge, and message preview
function RoomListItem({
  room,
  isActive,
  preview,
  isOnline,
  onSelect,
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(room.id)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent",
          isActive && "bg-accent",
        )}
      >
        {/* Avatar with relative online presence dot */}
        <div className="relative shrink-0">
          <Avatar
            src={room.avatarUrl}
            name={room.name}
            className="h-10 w-10 text-sm"
          />
          {isOnline && (
            <span
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-400"
              aria-label="Online"
            />
          )}
        </div>

        {/* Room name, unread count badge, and snippet preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-semibold">
              {room.name || "Unnamed"}
            </p>
            {room.unreadCount > 0 && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {room.unreadCount > 9 ? "9+" : room.unreadCount}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{preview}</p>
        </div>
      </button>
    </li>
  );
}

// Conversation list coordinating active chat selection, presence status, and unread badges
export function RoomList({
  rooms,
  activeRoomId,
  onSelect,
  currentUserId,
  previews = {},
}) {
  if (rooms.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No conversations yet. Start one with "New chat".
      </p>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {rooms.map((room) => {
        const isOnline = room.type === "private" && room.status === "online";
        const preview = resolveRoomPreview(room, currentUserId, previews);

        return (
          <RoomListItem
            key={room.id}
            room={room}
            isActive={activeRoomId === room.id}
            preview={preview}
            isOnline={isOnline}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}
