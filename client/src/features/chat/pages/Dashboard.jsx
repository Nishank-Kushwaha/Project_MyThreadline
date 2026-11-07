import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useSocket } from "@/app/providers/SocketContext";
import { useE2EE } from "@/features/e2ee/context/E2EEContext";
import { listRoomsRequest } from "@/features/chat/api/roomsApi";
import { decryptPreview } from "@/features/e2ee/lib/messages";
import {
  useNotificationClicks,
  useUnreadTitle,
} from "@/features/notifications/hooks/useChatNotifications";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { RoomList } from "../components/RoomList";
import { ChatWindow } from "../components/ChatWindow";
import { NewChatDialog } from "../components/NewChatDialog";
import { MembersPanel } from "../components/MembersPanel";
import { NotificationBanner } from "@/features/notifications/components/NotificationBanner";
import { cn } from "@/lib/utils";

// Sidebar width limits for md+ screens
const SIDEBAR_MIN = 280;
const SIDEBAR_DEFAULT = 320;
const SIDEBAR_KEY = "threadline:sidebar-width";

const getSidebarMax = () =>
  Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth / 2));

const clampSidebar = (width) =>
  Math.min(Math.max(width, SIDEBAR_MIN), getSidebarMax());

// Subcomponent: Header section for sidebar with brand, user avatar link and mobile close button
function SidebarHeader({ user, onCloseSidebar }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-lg font-extrabold tracking-tight">Threadline</span>
      <div className="flex items-center gap-2">
        <Link to="/profile" title="Edit profile">
          <Avatar
            src={user?.avatarUrl}
            name={user?.name}
            className="h-9 w-9 text-sm"
          />
        </Link>
        <button
          onClick={onCloseSidebar}
          aria-label="Close conversations"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// Subcomponent: Bottom action footer for sidebar with sign-out trigger
function SidebarFooter({ onOpenLogout }) {
  return (
    <div className="border-t border-border p-3 bg-muted/20">
      <button
        type="button"
        onClick={onOpenLogout}
        aria-label="Sign out"
        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/60 px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-xs transition-all hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]"
      >
        <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

// Subcomponent: Draggable divider for resizable sidebar on desktop
function ResizeHandle({
  sidebarWidth,
  isResizing,
  onStartResize,
  onResetResize,
  onKeyDown,
}) {
  return (
    <div className="relative hidden w-0 shrink-0 md:block">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversations"
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={getSidebarMax()}
        tabIndex={0}
        onPointerDown={onStartResize}
        onDoubleClick={onResetResize}
        onKeyDown={onKeyDown}
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
  );
}

// Subcomponent: Default view displayed when no chat room is selected
function EmptyChatPlaceholder({ onOpenSidebar }) {
  return (
    <div className="relative flex h-full items-center justify-center p-6 text-center">
      <button
        onClick={onOpenSidebar}
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
  );
}

// Subcomponent: Confirmation modal for signing out
function LogoutConfirmDialog({
  open,
  isLoggingOut,
  userName,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={() => !isLoggingOut && onCancel()}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-desc"
        className="relative z-10 w-full rounded-t-2xl border border-border bg-card p-6 shadow-2xl transition-all duration-200 sm:max-w-md sm:rounded-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <LogOut className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="logout-dialog-title"
              className="text-lg font-bold text-foreground"
            >
              Sign out of Threadline?
            </h3>
            <p
              id="logout-dialog-desc"
              className="mt-1.5 text-sm text-muted-foreground"
            >
              You will be signed out as{" "}
              <span className="font-semibold text-foreground">
                {userName || "User"}
              </span>
              . You'll need to enter your password to sign back in.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isLoggingOut}
            onClick={onCancel}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isLoggingOut}
            onClick={onConfirm}
            className="rounded-xl shadow-xs"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>Signing out…</span>
              </>
            ) : (
              <>
                <LogOut className="mr-1.5 h-4 w-4" />
                <span>Sign out</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Context hooks
  const { user, logout } = useAuth();
  const socket = useSocket();
  const e2ee = useE2EE();

  // State hooks
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [previews, setPreviews] = useState({});
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_KEY));
      return clampSidebar(saved || SIDEBAR_DEFAULT);
    } catch {
      return SIDEBAR_DEFAULT;
    }
  });

  // Derived state
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  // Custom notification hooks
  useUnreadTitle(rooms);
  useNotificationClicks((roomId) => {
    if (rooms.some((r) => r.id === roomId)) {
      handleSelectRoom(roomId);
    }
  });

  // Persist sidebar width after resizing completes
  useEffect(() => {
    if (isResizing) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth));
    } catch {
      // localStorage may be disabled or unavailable
    }
  }, [sidebarWidth, isResizing]);

  // Adjust sidebar width when window resizes
  useEffect(() => {
    const onResize = () => setSidebarWidth((w) => clampSidebar(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Update body styling during drag resizing
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

  // Close logout modal when Escape is pressed
  useEffect(() => {
    if (!showLogoutConfirm) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !isLoggingOut) {
        setShowLogoutConfirm(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showLogoutConfirm, isLoggingOut]);

  // Initial rooms fetch and handle ?room= query parameter
  useEffect(() => {
    const openRoomId = new URLSearchParams(window.location.search).get("room");

    listRoomsRequest().then(({ data }) => {
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

  // Reset members panel when active room changes
  useEffect(() => {
    setIsMembersOpen(false);
  }, [activeRoomId]);

  // Clear unread badge for currently active room
  useEffect(() => {
    if (!activeRoomId) return;

    const room = rooms.find((r) => r.id === activeRoomId);
    if (!room || room.unreadCount === 0) return;

    setRooms((prev) =>
      prev.map((r) => (r.id === activeRoomId ? { ...r, unreadCount: 0 } : r)),
    );
    socket?.emit("message:seen", { roomId: activeRoomId });
  }, [rooms, activeRoomId, socket]);

  // Re-decrypt previews after backup restoration
  useEffect(() => {
    setPreviews({});
  }, [e2ee.historyVersion]);

  // Decrypt sidebar previews for encrypted messages
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

  // Socket: realtime message updates (new, edited, deleted, system)
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async ({ roomId, message }) => {
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
                  system: message.system,
                  attachments: message.attachments,
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

  // Socket: newly created room
  useEffect(() => {
    if (!socket) return;
    const handleRoomNew = (room) => {
      setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
    };
    socket.on("room:new", handleRoomNew);
    return () => socket.off("room:new", handleRoomNew);
  }, [socket]);

  // Socket: presence updates for contacts
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

  // Socket: member changes and room removal
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

  // Socket: group name and avatar updates
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

  // Socket: group admin promotions and demotions
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

  // Actions: resize handling
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

  const handleResizeKeyDown = (e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") setSidebarWidth((w) => clampSidebar(w - step));
    else if (e.key === "ArrowRight")
      setSidebarWidth((w) => clampSidebar(w + step));
    else if (e.key === "Home") setSidebarWidth(SIDEBAR_MIN);
    else if (e.key === "End") setSidebarWidth(getSidebarMax());
    else return;
    e.preventDefault();
  };

  // Actions: logout confirmation
  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success("Signed out successfully");
    } catch {
      toast.error("Error signing out. Please try again.");
      setIsLoggingOut(false);
    }
  };

  // Actions: room selection and creation
  const handleSelectRoom = (roomId) => {
    setActiveRoomId(roomId);
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    );
    setIsSidebarOpen(false);
  };

  const handleRoomCreated = (room) => {
    setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
    socket?.emit("room:join", room.id);
    setActiveRoomId(room.id);
    setIsNewChatOpen(false);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-dvh">
      {/* Mobile drawer backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar drawer / column */}
      <aside
        style={{ "--sidebar-w": `${sidebarWidth}px` }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] shrink-0 flex-col border-r border-border bg-background transition-transform duration-200",
          "md:relative md:z-auto md:w-(--sidebar-w) md:max-w-none md:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarHeader
          user={user}
          onCloseSidebar={() => setIsSidebarOpen(false)}
        />

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

        <SidebarFooter onOpenLogout={() => setShowLogoutConfirm(true)} />
      </aside>

      {/* Resizer divider handle */}
      <ResizeHandle
        sidebarWidth={sidebarWidth}
        isResizing={isResizing}
        onStartResize={startResize}
        onResetResize={() => setSidebarWidth(SIDEBAR_DEFAULT)}
        onKeyDown={handleResizeKeyDown}
      />

      {/* Main chat viewport */}
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
          <EmptyChatPlaceholder
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
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

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        isLoggingOut={isLoggingOut}
        userName={user?.name}
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
