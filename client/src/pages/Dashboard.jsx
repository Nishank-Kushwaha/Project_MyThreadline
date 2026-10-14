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
import { NotificationBanner } from "@/features/chat/NotificationBanner";
import {
  useNotificationClicks,
  useUnreadTitle,
} from "@/features/chat/useChatNotifications";
import { useE2EE } from "@/features/e2ee/E2EEContext";
import { decryptPreview } from "@/lib/e2ee/messages";

// Sidebar width limits for md+ screens (like WhatsApp Web)
const SIDEBAR_MIN = 280;
const SIDEBAR_DEFAULT = 320; // same as the old w-80
const SIDEBAR_KEY = "threadline:sidebar-width";

// The sidebar can grow up to half of the screen width
const getSidebarMax = () =>
  Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth / 2));

const clampSidebar = (width) =>
  Math.min(Math.max(width, SIDEBAR_MIN), getSidebarMax());

export default function Dashboard() {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const e2ee = useE2EE();

  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [previews, setPreviews] = useState({}); // lastMessage id -> decrypted preview text

  // Resizable sidebar (laptop). Remembered between visits.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_KEY));
      return clampSidebar(saved || SIDEBAR_DEFAULT);
    } catch {
      return SIDEBAR_DEFAULT;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  // Save once the drag has finished, not on every pixel
  useEffect(() => {
    if (isResizing) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth));
    } catch {
      /* storage unavailable: width just won't be remembered */
    }
  }, [sidebarWidth, isResizing]);

  // Window got smaller: pull the sidebar back inside the limits
  useEffect(() => {
    const onResize = () => setSidebarWidth((w) => clampSidebar(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // While dragging: resize cursor everywhere, and no accidental text selection
  useEffect(() => {
    if (!isResizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [isResizing]);

  const startResize = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    setIsResizing(true);

    const onMove = (ev) =>
      setSidebarWidth(clampSidebar(startWidth + ev.clientX - startX));
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Keyboard: arrows resize (Shift = bigger steps), Home/End jump to the limits
  const onHandleKeyDown = (e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") setSidebarWidth((w) => clampSidebar(w - step));
    else if (e.key === "ArrowRight")
      setSidebarWidth((w) => clampSidebar(w + step));
    else if (e.key === "Home") setSidebarWidth(SIDEBAR_MIN);
    else if (e.key === "End") setSidebarWidth(getSidebarMax());
    else return;
    e.preventDefault();
  };

  // Keep the sidebar live for EVERY room (preview, unread badge, ordering).
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async ({ roomId, message }) => {
      // Decrypt BEFORE touching state, so the sidebar never renders the
      // "🔒 Encrypted message" placeholder for even an instant.
      if (message.encrypted && message.e2ee) {
        const previewText = await decryptPreview(
          { e2ee: message.e2ee, sender: message.sender._id },
          { roomId, userId: user.id },
        );

        setPreviews((prev) => ({ ...prev, [message._id]: previewText }));
      }

      setRooms((prev) => {
        const isFromMe = message.sender._id === user.id;
        const isOpen = roomId === activeRoomId;

        const updated = prev.map((room) => {
          if (room.id !== roomId) return room;

          // Decrypting takes a moment. If a newer message already became the
          // preview in the meantime, don't step back to an older one.
          const isNewest =
            !room.lastMessage?.createdAt ||
            new Date(message.createdAt) >= new Date(room.lastMessage.createdAt);

          return {
            ...room,
            lastMessage: isNewest
              ? {
                  messageId: message._id,
                  text: message.text,
                  sender: message.sender._id,
                  createdAt: message.createdAt,
                  encrypted: message.encrypted,
                  e2ee: message.e2ee,
                }
              : room.lastMessage,
            unreadCount: isOpen || isFromMe ? 0 : room.unreadCount + 1,
          };
        });

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
              ? {
                  ...room,
                  lastMessage: {
                    ...room.lastMessage,
                    text: newText,
                    e2ee: undefined,
                  },
                }
              : room,
          ),
        );
      };

    const handleEdited = async ({
      roomId,
      messageId,
      text,
      e2ee,
      senderId,
    }) => {
      if (e2ee) {
        // Decrypt first, so the preview changes in one step with no placeholder.
        const previewText = await decryptPreview(
          { e2ee, sender: senderId },
          { roomId, userId: user.id },
        );

        setPreviews((prev) => ({ ...prev, [messageId]: previewText }));
        setRooms((prev) =>
          prev.map((room) =>
            room.id === roomId && room.lastMessage?.messageId === messageId
              ? { ...room, lastMessage: { ...room.lastMessage, e2ee } }
              : room,
          ),
        );
        return;
      }

      handlePreviewTextChange(text)({ roomId, messageId });
    };

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

  // My role in a group changed while I'm online (promoted, dismissed, or
  // auto-promoted when the only admin left): keep the sidebar's copy in sync.
  useEffect(() => {
    if (!socket) return;

    const setMyRole =
      (isAdmin) =>
      ({ roomId, memberId }) => {
        if (memberId !== user?.id) return;

        setRooms((prev) =>
          prev.map((room) =>
            room.id === roomId ? { ...room, isAdmin } : room,
          ),
        );
      };

    const handlePromoted = setMyRole(true);
    const handleDemoted = setMyRole(false);

    socket.on("room:member-promoted", handlePromoted);
    socket.on("room:member-demoted", handleDemoted);

    return () => {
      socket.off("room:member-promoted", handlePromoted);
      socket.off("room:member-demoted", handleDemoted);
    };
  }, [socket, user?.id]);

  // This handles a notification click when no tab was open, where the service worker opens /?room=<id>
  useEffect(() => {
    // Read BEFORE fetching: in dev, StrictMode runs this effect twice, and both
    // runs must see the same value.
    const openRoomId = new URLSearchParams(window.location.search).get("room");

    listRoomsRequest().then(({ data }) => {
      // The room being opened is about to be seen, so it never shows a badge.
      // It's cleared in the same update that stores the list, so a later
      // response can't bring the old count back.
      setRooms(
        data.rooms.map((room) =>
          room.id === openRoomId ? { ...room, unreadCount: 0 } : room,
        ),
      );

      if (openRoomId && data.rooms.some((r) => r.id === openRoomId)) {
        setActiveRoomId(openRoomId);
        setIsSidebarOpen(false);
      }

      if (openRoomId) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });
  }, []);

  useEffect(() => {
    setIsMembersOpen(false);
  }, [activeRoomId]);

  // The room that's open never has unread messages. However a stale count got
  // there (a late room-list response, a replaced room object), clear it and
  // tell the server.
  useEffect(() => {
    if (!activeRoomId) return;

    const room = rooms.find((r) => r.id === activeRoomId);
    if (!room || room.unreadCount === 0) return;

    setRooms((prev) =>
      prev.map((r) => (r.id === activeRoomId ? { ...r, unreadCount: 0 } : r)),
    );
    socket?.emit("message:seen", { roomId: activeRoomId });
  }, [rooms, activeRoomId, socket]);

  // A restored backup can make older previews readable: decrypt them again.
  useEffect(() => {
    setPreviews({});
  }, [e2ee.historyVersion]);

  // Decrypt the sidebar preview of rooms whose last message is encrypted. The
  // server only holds ciphertext, so each browser reads it for itself.
  useEffect(() => {
    if (e2ee.status !== "ready" || !user?.id) return;

    const pending = rooms.filter(
      (room) =>
        room.lastMessage?.e2ee &&
        previews[room.lastMessage.messageId] === undefined,
    );
    if (pending.length === 0) return;

    Promise.all(
      pending.map(async (room) => [
        room.lastMessage.messageId,
        await decryptPreview(room.lastMessage, {
          roomId: room.id,
          userId: user.id,
        }),
      ]),
    ).then((entries) => {
      setPreviews((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [rooms, e2ee.status, user?.id, previews]);

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

  useUnreadTitle(rooms);
  useNotificationClicks((roomId) => {
    if (rooms.some((r) => r.id === roomId)) handleSelectRoom(roomId);
  });

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
        style={{ "--sidebar-w": `${sidebarWidth}px` }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-r border-border bg-background transition-transform duration-200",
          "md:relative md:z-auto md:w-(--sidebar-w) md:max-w-none md:translate-x-0",
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

        <NotificationBanner />

        <RoomList
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelect={handleSelectRoom}
          currentUserId={user?.id}
          previews={previews}
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

      {/* Drag handle between the list and the chat (md and up only).
          Double-click resets the width. */}
      <div className="relative hidden w-0 shrink-0 md:block">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize conversations"
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={getSidebarMax()}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
          onKeyDown={onHandleKeyDown}
          className="group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none outline-none"
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary transition-opacity",
              isResizing
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </div>
      </div>

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
