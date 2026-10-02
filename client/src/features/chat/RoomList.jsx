import React from "react";
import { cn, resolveAvatarUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export function RoomList({ rooms, activeRoomId, onSelect }) {
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
        const avatar = resolveAvatarUrl(room.avatarUrl);
        const isOnline = room.type === "private" && room.status === "online";

        return (
          <li key={room.id}>
            <button
              onClick={() => onSelect(room.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent",
                activeRoomId === room.id && "bg-accent",
              )}
            >
              {/* relative wrapper so the online dot can sit on the avatar's corner */}
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
                <p className="truncate text-xs text-muted-foreground">
                  {room.lastMessage?.text ||
                    (room.type === "group"
                      ? `${room.memberCount} members`
                      : "Say hello")}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
