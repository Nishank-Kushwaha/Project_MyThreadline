import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Menu, Users } from "lucide-react";
import { getRoomMessagesRequest } from "@/api/roomsApi";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { formatLastSeen, resolveAvatarUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

const TYPING_IDLE_MS = 1500; // I stop typing => tell others after this much silence
const TYPING_REFRESH_MS = 2500; // while I keep typing, re-announce this often
const TYPING_EXPIRE_MS = 4000; // safety net: hide someone else's indicator if "stop" never arrives

const PAGE_SIZE = 30; // how many messages to fetch at once

export function ChatWindow({
  room,
  currentUser,
  socket,
  onOpenSidebar,
  onOpenMembers,
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({}); // { [userId]: name }

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const bottomRef = useRef(null);
  const expireTimers = useRef({}); // per-user timers for OTHER people's indicators
  const idleTimer = useRef(null); // my own "stopped typing" timer
  const isTypingRef = useRef(false);
  const lastTypingEmitRef = useRef(0);

  const scrollRef = useRef(null);
  const loadingMoreRef = useRef(false); // sync guard against double fetches
  const scrollAction = useRef("append"); // "initial" | "prepend" | "append"
  const prevScrollHeight = useRef(0);
  const lastMessageIdRef = useRef(null);
  const activeRoomRef = useRef(room.id);
  activeRoomRef.current = room.id;

  const recipientCount = room.memberCount - 1; // everyone except me

  const removeTyping = useCallback((userId) => {
    clearTimeout(expireTimers.current[userId]);
    setTypingUsers((prev) => {
      const { [userId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // ---------- 1) History over REST ----------
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setMessages([]);
    setHasMore(true);
    setIsLoadingMore(false);
    loadingMoreRef.current = false;

    getRoomMessagesRequest(room.id, { limit: PAGE_SIZE })
      .then(({ data }) => {
        if (cancelled) return;
        scrollAction.current = "initial";
        setMessages(data.messages);
        setHasMore(data.messages.length === PAGE_SIZE);
        setIsLoading(false); // same tick as setMessages so the scroll effect sees real content
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id]);

  // ---------- 2) Load older messages on scroll ----------
  const loadOlder = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || messages.length === 0) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const requestedRoom = room.id;

    try {
      const { data } = await getRoomMessagesRequest(room.id, {
        before: messages[0].createdAt,
        limit: PAGE_SIZE,
      });
      if (activeRoomRef.current !== requestedRoom) return; // user switched rooms

      prevScrollHeight.current = scrollRef.current.scrollHeight;
      scrollAction.current = "prepend";

      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m._id));
        return [...data.messages.filter((m) => !existing.has(m._id)), ...prev];
      });
      setHasMore(data.messages.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, messages, room.id]);

  // ---------- 3) Live messages + receipts ----------
  useEffect(() => {
    if (!socket) return;

    socket.emit("message:seen", { roomId: room.id }); // opening the room = seeing what's there

    // "everything up to <upTo> that I sent has reached <userId>"
    const receiptHandler =
      (fields) =>
      ({ roomId, userId, upTo }) => {
        if (roomId !== room.id) return;
        const cutoff = new Date(upTo).getTime();

        setMessages((prev) =>
          prev.map((m) => {
            const isMine = m.sender._id === currentUser.id;
            if (!isMine || new Date(m.createdAt).getTime() > cutoff) return m;

            const next = { ...m };
            for (const field of fields) {
              const list = m[field] || [];
              if (!list.includes(userId)) next[field] = [...list, userId];
            }
            return next;
          }),
        );
      };

    const handleNewMessage = ({ roomId, message }) => {
      if (roomId !== room.id) return;
      setMessages((prev) => [...prev, message]);
      removeTyping(message.sender._id); // they sent it, so they're no longer "typing"
      socket.emit("message:seen", { roomId: room.id }); // still open => still seen
    };
    const handleDelivered = receiptHandler(["deliveredTo"]);
    const handleSeenUpdate = receiptHandler(["seenBy", "deliveredTo"]); // seen implies delivered
    // A reaction changed on some message in this room — replace just that
    // message's reactions array; everything else about it stays untouched.
    const handleReactionUpdate = ({ roomId, messageId, reactions }) => {
      if (roomId !== room.id) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)),
      );
    };
    // Someone edited a message — swap in the new text, mark it edited.
    const handleEdited = ({ roomId, messageId, text, editedAt }) => {
      if (roomId !== room.id) return;
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, text, editedAt } : m)),
      );
    };
    // Someone deleted a message — the SERVER already cleared text/reactions;
    // mirror that here rather than removing it from the list, so the
    // placeholder ("This message was deleted") renders in its place.
    const handleDeleted = ({ roomId, messageId, deletedAt }) => {
      if (roomId !== room.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, text: "", reactions: [], deletedAt }
            : m,
        ),
      );
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:delivered", handleDelivered);
    socket.on("message:seen-update", handleSeenUpdate);
    socket.on("message:reaction-update", handleReactionUpdate);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:delivered", handleDelivered);
      socket.off("message:seen-update", handleSeenUpdate);
      socket.off("message:reaction-update", handleReactionUpdate);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
    };
  }, [socket, room.id, currentUser.id, removeTyping]);

  // ---------- 4) Other people typing ----------
  useEffect(() => {
    if (!socket) return;

    const handleTypingStart = ({ roomId, userId, name }) => {
      if (roomId !== room.id) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: name }));
      clearTimeout(expireTimers.current[userId]);
      expireTimers.current[userId] = setTimeout(
        () => removeTyping(userId),
        TYPING_EXPIRE_MS,
      );
    };
    const handleTypingStop = ({ roomId, userId }) => {
      if (roomId === room.id) removeTyping(userId);
    };

    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    return () => {
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      Object.values(expireTimers.current).forEach(clearTimeout);
    };
  }, [socket, room.id, removeTyping]);

  // ---------- 5) ME typing ----------
  const stopTyping = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (isTypingRef.current) {
      socket?.emit("typing:stop", { roomId: room.id });
      isTypingRef.current = false;
    }
  }, [socket, room.id]);

  // ---------- 6) Scroll behavior ----------
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (scrollAction.current === "prepend") {
      // keep the same message under the user's eyes
      el.scrollTop = el.scrollHeight - prevScrollHeight.current;
    } else if (scrollAction.current === "initial") {
      el.scrollTop = el.scrollHeight; // jump, no animation
    } else {
      // only follow when a NEW message arrived, not on receipts/reactions
      const lastId = messages[messages.length - 1]?._id;
      if (lastId !== lastMessageIdRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }

    lastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
    scrollAction.current = "append";
  }, [messages]);

  // stop typing when I leave the room or close the tab
  useEffect(() => stopTyping, [stopTyping]);

  const handleTyping = () => {
    if (!socket) return;
    const now = Date.now();
    // Announce once, then re-announce every ~2.5s while still typing, so
    // other people's expiry timers (4s) never fire mid-sentence.
    if (
      !isTypingRef.current ||
      now - lastTypingEmitRef.current > TYPING_REFRESH_MS
    ) {
      socket.emit("typing:start", { roomId: room.id });
      lastTypingEmitRef.current = now;
      isTypingRef.current = true;
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const handleSend = (text) => {
    if (!socket) return;
    stopTyping();
    socket.emit("message:send", { roomId: room.id, text }, (ack) => {
      if (!ack?.success) console.error("Message failed to send:", ack?.message);
    });
  };

  const handleReact = (messageId, emoji) => {
    if (!socket) return;
    socket.emit(
      "message:react",
      { roomId: room.id, messageId, emoji },
      (ack) => {
        if (!ack?.success) console.error("Reaction failed:", ack?.message);
      },
    );
  };

  const handleEditMessage = (messageId, text) => {
    if (!socket) return;
    socket.emit("message:edit", { roomId: room.id, messageId, text }, (ack) => {
      if (!ack?.success) alert(ack?.message || "Couldn't edit that message.");
    });
  };

  const handleDeleteMessage = (messageId) => {
    if (!socket) return;
    socket.emit("message:delete", { roomId: room.id, messageId }, (ack) => {
      if (!ack?.success) alert(ack?.message || "Couldn't delete that message.");
    });
  };

  const handleScroll = (e) => {
    if (e.currentTarget.scrollTop < 100) loadOlder();
  };

  // ---------- Header text ----------
  const typingNames = Object.values(typingUsers);
  let typingText = "";
  if (typingNames.length > 0) {
    if (room.type === "private") typingText = "typing…";
    else if (typingNames.length === 1)
      typingText = `${typingNames[0]} is typing…`;
    else
      typingText = `${typingNames.slice(0, 2).join(", ")}${typingNames.length > 2 ? " and others" : ""} are typing…`;
  }

  let subtitle;
  if (typingText) subtitle = <span className="text-primary">{typingText}</span>;
  else if (room.type === "group") subtitle = `${room.memberCount} members`;
  else if (room.status === "online")
    subtitle = <span className="text-primary">Online</span>;
  else subtitle = formatLastSeen(room.lastSeen);

  const avatar = resolveAvatarUrl(room.avatarUrl);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <button
          onClick={onOpenSidebar}
          aria-label="Open conversations"
          className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Avatar
          src={room.avatarUrl}
          name={room.name}
          className="h-9 w-9 text-xs"
        />
        <div className="min-w-0 flex-1">
          {" "}
          <p className="truncate text-sm font-semibold"> {room.name} </p>{" "}
          <p className="truncate text-xs text-muted-foreground">
            {" "}
            {subtitle}{" "}
          </p>{" "}
        </div>{" "}
        {/* Private chats are always exactly 2 people, so there is nothing to manage. */}{" "}
        {room.type === "group" && (
          <button
            onClick={onOpenMembers}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Manage members"
          >
            {" "}
            <Users className="h-4 w-4" /> {room.memberCount}{" "}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m._id}
              message={m}
              isOwn={m.sender._id === currentUser.id}
              isGroup={room.type === "group"}
              recipientCount={recipientCount}
              currentUserId={currentUser.id}
              onReact={handleReact}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}
