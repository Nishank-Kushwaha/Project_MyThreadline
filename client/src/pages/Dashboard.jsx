import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { listRoomsRequest } from "@/api/roomsApi";
import { Button } from "@/components/ui/button";
import { RoomList } from "@/features/chat/RoomList";
import { ChatWindow } from "@/features/chat/ChatWindow";
import { NewChatDialog } from "@/features/chat/NewChatDialog";
import { cn, resolveAvatarUrl } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MembersPanel } from "@/features/chat/MembersPanel";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const socket = useSocket();

  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  useEffect(() => {
    listRoomsRequest().then(({ data }) => {
      console.log("Fetched rooms:", data.rooms);
      setRooms(data.rooms);
    });
  }, []);

  // Keep the sidebar live for EVERY room (preview, unread badge, ordering).
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = ({ roomId, message }) => {
      setRooms((prev) => {
        const isFromMe = message.sender._id === user.id;
        const isOpen = roomId === activeRoomId;

        const updated = prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                lastMessage: {
                  messageId: message._id,
                  text: message.text,
                  sender: message.sender._id,
                  createdAt: message.createdAt,
                },
                unreadCount: isOpen || isFromMe ? 0 : room.unreadCount + 1,
              }
            : room,
        );

        const index = updated.findIndex((room) => room.id === roomId);
        if (index > 0) {
          const [moved] = updated.splice(index, 1);
          updated.unshift(moved);
        }
        return updated;
      });
    };

    // An edit/delete only touches the sidebar if it happened to the room's
    // CURRENT preview message — compare by messageId, not by content.
    const handlePreviewTextChange =
      (newText) =>
      ({ roomId, messageId }) => {
        setRooms((prev) =>
          prev.map((room) =>
            room.id === roomId && room.lastMessage?.messageId === messageId
              ? { ...room, lastMessage: { ...room.lastMessage, text: newText } }
              : room,
          ),
        );
      };
    const handleEdited = ({ roomId, messageId, text }) =>
      handlePreviewTextChange(text)({ roomId, messageId });

    const handleDeleted = ({ roomId, messageId }) =>
      handlePreviewTextChange("This message was deleted")({
        roomId,
        messageId,
      });

    // Group events update the preview and ordering, but never the unread badge.
    const handleSystemMessage = ({ roomId, message }) => {
      setRooms((prev) => {
        const updated = prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                lastMessage: {
                  messageId: message._id,
                  text: message.text,
                  sender: null,
                  createdAt: message.createdAt,
                  system: message.system,
                },
              }
            : room,
        );

        const index = updated.findIndex((room) => room.id === roomId);
        if (index > 0) {
          const [moved] = updated.splice(index, 1);
          updated.unshift(moved);
        }
        return updated;
      });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);
    socket.on("message:system", handleSystemMessage);
    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
      socket.off("message:system", handleSystemMessage);
    };
  }, [socket, activeRoomId, user?.id]);

  // Someone started a chat with me / added me to a group while I'm online.
  useEffect(() => {
    if (!socket) return;
    const handleRoomNew = (room) => {
      setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
    };
    socket.on("room:new", handleRoomNew);
    return () => socket.off("room:new", handleRoomNew);
  }, [socket]);

  // Live online/offline for the people I chat with. Only private rooms carry a
  // single "other user", so that's what we match against.
  useEffect(() => {
    if (!socket) return;

    const handlePresence = ({ userId, status, lastSeen }) => {
      setRooms((prev) =>
        prev.map((room) =>
          room.type === "private" && room.otherUserId === userId
            ? { ...room, status, lastSeen: lastSeen ?? room.lastSeen }
            : room,
        ),
      );
    };

    socket.on("presence:update", handlePresence);
    return () => socket.off("presence:update", handlePresence);
  }, [socket]);

  // Live member count for group rooms, and remove rooms when deleted.
  useEffect(() => {
    if (!socket) return;
    const handleMemberAdded = ({ roomId }) => {
      setRooms((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? { ...room, memberCount: room.memberCount + 1 }
            : room,
        ),
      );
    };
    const handleMemberRemoved = ({ roomId }) => {
      setRooms((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? { ...room, memberCount: room.memberCount - 1 }
            : room,
        ),
      );
    };
    const handleRoomRemoved = ({ roomId }) => {
      setRooms((prev) => prev.filter((room) => room.id !== roomId));
      setActiveRoomId((prev) => (prev === roomId ? null : prev));
      setIsMembersOpen(false);
    };
    socket.on("room:member-added", handleMemberAdded);
    socket.on("room:member-removed", handleMemberRemoved);
    socket.on("room:removed", handleRoomRemoved);
    return () => {
      socket.off("room:member-added", handleMemberAdded);
      socket.off("room:member-removed", handleMemberRemoved);
      socket.off("room:removed", handleRoomRemoved);
    };
  }, [socket]);

  // Someone renamed a group or changed its photo while I'm online.
  useEffect(() => {
    if (!socket) return;

    const handleNameUpdated = ({ roomId, name }) => {
      setRooms((prev) =>
        prev.map((room) => (room.id === roomId ? { ...room, name } : room)),
      );
    };

    const handleAvatarUpdated = ({ roomId, avatarUrl }) => {
      setRooms((prev) =>
        prev.map((room) =>
          room.id === roomId ? { ...room, avatarUrl } : room,
        ),
      );
    };

    socket.on("room:name-updated", handleNameUpdated);
    socket.on("room:avatar-updated", handleAvatarUpdated);

    return () => {
      socket.off("room:name-updated", handleNameUpdated);
      socket.off("room:avatar-updated", handleAvatarUpdated);
    };
  }, [socket]);

  useEffect(() => {
    setIsMembersOpen(false);
  }, [activeRoomId]);

  const handleSelectRoom = (roomId) => {
    setActiveRoomId(roomId);
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    );
    setIsSidebarOpen(false); // on small screens, reveal the chat after picking one
  };

  const handleRoomCreated = (room) => {
    setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
    socket?.emit("room:join", room.id); // this socket connected before the room existed
    setActiveRoomId(room.id);
    setIsNewChatOpen(false);
    setIsSidebarOpen(false);
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  return (
    <div className="flex h-dvh">
      {/* Dark backdrop behind the drawer (small screens only); click to close */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Small screens: fixed drawer that slides in/out.
          md and up: normal static column, always visible. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-r border-border bg-background transition-transform duration-200",
          "md:static md:z-auto md:max-w-none md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-4">
          <span className="text-lg font-extrabold tracking-tight">
            Threadline
          </span>
          <div className="flex items-center gap-2">
            <Link to="/profile" title="Edit profile">
              <Avatar
                src={user?.avatarUrl}
                name={user?.name}
                className="h-9 w-9 text-sm"
              />
            </Link>
            <button
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close conversations"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Button className="w-full" onClick={() => setIsNewChatOpen(true)}>
            New chat
          </Button>
        </div>

        <RoomList
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelect={handleSelectRoom}
          currentUserId={user?.id}
        />

        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            className="w-full hover:bg-rose-800"
            onClick={logout}
          >
            Sign out
          </Button>
        </div>
      </aside>

      {/* min-w-0 stops long messages from stretching this column past the screen */}
      <main className="min-w-0 flex-1">
        {activeRoom ? (
          <ChatWindow
            key={activeRoom.id}
            room={activeRoom}
            currentUser={user}
            socket={socket}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onOpenMembers={() => setIsMembersOpen(true)}
          />
        ) : (
          <div className="relative flex h-full items-center justify-center p-6 text-center">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open conversations"
              className="absolute left-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-lg font-bold">Pick a conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose one from the left, or start a new chat.
              </p>
            </div>
          </div>
        )}
      </main>

      <NewChatDialog
        open={isNewChatOpen}
        onOpenChange={setIsNewChatOpen}
        onCreated={handleRoomCreated}
      />

      {activeRoom && (
        <MembersPanel
          open={isMembersOpen}
          onOpenChange={setIsMembersOpen}
          room={activeRoom}
          currentUserId={user.id}
          socket={socket}
        />
      )}
    </div>
  );
}
