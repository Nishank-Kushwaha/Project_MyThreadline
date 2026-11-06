import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Menu,
  Phone,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatDateSeparator, formatLastSeen } from "@/lib/utils";
import { useCall } from "@/features/videoCall/context/CallContext";
import { useE2EE } from "@/features/e2ee/context/E2EEContext";
import { useRoomVerification } from "@/features/e2ee/hooks/useVerification";
import { useChatScroll } from "@/features/chat/hooks/useChatScroll";
import { useChatSearch } from "@/features/chat/hooks/useChatSearch";
import { getRoomMessagesRequest } from "@/features/chat/api/roomsApi";
import { uploadMediaRequest } from "@/features/chat/api/mediaApi";
import {
  clearRoomEncryptionCache,
  getRoomEncryption,
} from "@/features/e2ee/lib/directory";
import {
  buildOutgoingMessage,
  buildPollVoteRequest,
  buildReactionRequest,
  decryptMessage,
  decryptMessages,
  decryptPollVotes,
  decryptReactions,
} from "@/features/e2ee/lib/messages";
import {
  cacheDecryptedMessages,
  removeCachedMessage,
} from "@/features/e2ee/lib/messageStore";
import { encryptMedia } from "@/features/e2ee/lib/media";
import { EncryptionNotice } from "@/features/e2ee/components/EncryptionNotice";
import { KeyChangeNotice } from "@/features/e2ee/components/KeyChangeNotice";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { MessageSearchBar } from "./MessageSearchBar";
import { SafetyNumberDialog } from "@/features/e2ee/components/SafetyNumberDialog";
import { SystemMessage } from "./SystemMessage";
import { TypingIndicator } from "./TypingIndicator";

const TYPING_IDLE_MS = 1500;
const TYPING_REFRESH_MS = 2500;
const TYPING_EXPIRE_MS = 4000;
const PAGE_SIZE = 30;

// Inserts an incoming message by creation timestamp to avoid race condition reordering
function insertInOrder(list, message) {
  if (list.some((m) => m._id === message._id)) return list;

  const time = new Date(message.createdAt).getTime();
  let index = list.length;

  while (index > 0 && new Date(list[index - 1].createdAt).getTime() > time) {
    index -= 1;
  }

  return [...list.slice(0, index), message, ...list.slice(index)];
}

// Fullscreen dropzone overlay displayed when dragging files over the chat window
function ChatDropOverlay({ isDraggingOver }) {
  if (!isDraggingOver) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/85 p-6 backdrop-blur-md animate-in fade-in duration-150 pointer-events-none">
      <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-primary/10 p-10 text-center shadow-2xl">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
          <UploadCloud className="h-8 w-8 animate-bounce" />
        </div>
        <h3 className="text-lg font-bold text-foreground">
          Drop files here to send
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Images, documents, and files up to 15 MiB
        </p>
      </div>
    </div>
  );
}

// Floating date badge displayed at the top of the chat during scrolling
function ChatStickyDate({ visible, date, scrollbarWidth }) {
  if (!date) return null;

  return (
    <div
      aria-hidden={!visible}
      style={{ right: scrollbarWidth }}
      className={cn(
        "pointer-events-none absolute top-3 inset-x-0 z-20 flex justify-center transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
      )}
    >
      <span className="rounded-full border border-border/70 bg-background/90 px-3.5 py-1 font-sans text-xs font-semibold text-foreground/90 shadow-md backdrop-blur-md">
        {date}
      </span>
    </div>
  );
}

// Floating button to scroll back to the latest message with unread counter
function ChatScrollBottom({ visible, unreadCount, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to bottom"
      title="Scroll to bottom"
      className={cn(
        "absolute bottom-4 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground/80 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-accent hover:text-foreground active:scale-95",
        visible
          ? "scale-100 opacity-100 translate-y-0 pointer-events-auto"
          : "pointer-events-none scale-90 opacity-0 translate-y-2",
      )}
    >
      <ChevronDown className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-xs animate-in zoom-in-50 duration-200">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

// Top navigation bar for the active room showing status, calls, search and security verification
function ChatHeader({
  room,
  subtitle,
  onOpenSidebar,
  onOpenMembers,
  isSearchOpen,
  onToggleSearch,
  contactStatus,
  encryption,
  onVerifyUser,
  initiateCall,
}) {
  const ContactShield =
    contactStatus?.state === "verified"
      ? ShieldCheck
      : contactStatus?.state === "changed"
        ? ShieldAlert
        : Shield;

  const handleStartCall = (callType) => {
    if (!room.otherUserId) return;
    initiateCall?.({
      targetUserId: room.otherUserId,
      roomId: room.id,
      peerUser: {
        _id: room.otherUserId,
        name: room.name,
        avatarUrl: room.avatarUrl,
      },
      callType,
    });
  };

  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      {/* Mobile sidebar trigger */}
      <button
        onClick={onOpenSidebar}
        aria-label="Open conversations"
        className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Room avatar and title */}
      <Avatar
        src={room.avatarUrl}
        name={room.name}
        className="h-9 w-9 text-xs"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{room.name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {/* Voice & Video Call triggers for private 1-on-1 chats */}
      {room.type === "private" && room.otherUserId && (
        <>
          <button
            onClick={() => handleStartCall("audio")}
            aria-label="Start voice call"
            title="Voice call"
            className="flex shrink-0 items-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleStartCall("video")}
            aria-label="Start video call"
            title="Video call"
            className="flex shrink-0 items-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <Video className="h-4 w-4" />
          </button>
        </>
      )}

      {/* In-chat search toggle */}
      <button
        onClick={onToggleSearch}
        aria-label={isSearchOpen ? "Close search" : "Search messages"}
        title={isSearchOpen ? "Close search" : "Search messages"}
        className={cn(
          "flex shrink-0 items-center rounded-md p-1.5 transition",
          isSearchOpen
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Security code verification shield for private E2EE chats */}
      {contactStatus && encryption === "active" && (
        <button
          onClick={() => onVerifyUser(room.otherUserId)}
          aria-label="Verify security code"
          title={
            contactStatus.state === "verified"
              ? "Verified. View security code"
              : contactStatus.state === "changed"
                ? "Security code changed. Review it"
                : "Verify security code"
          }
          className={cn(
            "flex shrink-0 items-center rounded-md p-1.5 hover:bg-accent",
            contactStatus.state === "verified" && "text-emerald-500",
            contactStatus.state === "changed" && "text-amber-500",
            contactStatus.state === "unverified" &&
              "text-muted-foreground hover:text-foreground",
          )}
        >
          <ContactShield className="h-4 w-4" />
        </button>
      )}

      {/* Group member count & panel trigger */}
      {room.type === "group" && (
        <button
          onClick={onOpenMembers}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Manage members"
        >
          <Users className="h-4 w-4" /> {room.memberCount}
        </button>
      )}
    </div>
  );
}

// Main conversation panel coordinating E2EE live messaging, attachments, reactions and call triggers
export function ChatWindow({
  room,
  currentUser,
  socket,
  onOpenSidebar,
  onOpenMembers,
}) {
  const e2ee = useE2EE();
  const { initiateCall } = useCall();

  // Primary messaging state
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sendError, setSendError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);

  // Real-time typing indicators state
  const [typingUsers, setTypingUsers] = useState({});

  // E2EE encryption & verification state
  const [encryption, setEncryption] = useState("checking");
  const [pendingNames, setPendingNames] = useState([]);
  const [rosterVersion, setRosterVersion] = useState(0);
  const [verifyUserId, setVerifyUserId] = useState(null);

  // Drag-and-drop attachment state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);

  // Operational references
  const expireTimers = useRef({});
  const idleTimer = useRef(null);
  const isTypingRef = useRef(false);
  const lastTypingEmitRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const activeRoomRef = useRef(room.id);
  activeRoomRef.current = room.id;
  const messagesRef = useRef([]);
  messagesRef.current = messages;
  const reactionSeq = useRef({});
  const pollVoteSeq = useRef({});
  const dragCounterRef = useRef(0);

  // Room verification hook
  const verification = useRoomVerification({
    room,
    currentUserId: currentUser.id,
    socket,
  });

  const changedContacts = Object.values(verification.statuses).filter(
    (status) => status.state === "changed",
  );

  const contactStatus =
    room.type === "private" ? verification.statuses[room.otherUserId] : null;

  const recipientCount = room.memberCount - 1;

  // Typing state cleanup helper
  const removeTyping = useCallback((userId) => {
    clearTimeout(expireTimers.current[userId]);
    setTypingUsers((prev) => {
      const { [userId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // Fetch older messages on upward scroll
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
      if (activeRoomRef.current !== requestedRoom) return;

      const readable = await decryptMessages(data.messages, {
        roomId: room.id,
        userId: currentUser.id,
      });
      if (activeRoomRef.current !== requestedRoom) return;

      chatScroll.prevScrollHeight.current =
        chatScroll.scrollRef.current?.scrollHeight || 0;
      chatScroll.scrollAction.current = "prepend";

      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m._id));
        return [...readable.filter((m) => !existing.has(m._id)), ...prev];
      });
      cacheDecryptedMessages(room.id, readable);
      setHasMore(data.messages.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, messages, room.id, currentUser.id]);

  // Fetch target message neighborhood for search navigation
  const fetchAroundMessage = useCallback(
    async (targetId) => {
      chatScroll.scrollAction.current = "initial";
      const { data } = await getRoomMessagesRequest(room.id, {
        around: targetId,
        limit: PAGE_SIZE,
      });

      const readable = await decryptMessages(data.messages, {
        roomId: room.id,
        userId: currentUser.id,
      });

      cacheDecryptedMessages(room.id, readable);
      setMessages(readable);
      setHasMore(true);
    },
    [room.id, currentUser.id],
  );

  // Manage in-chat search
  const chatSearch = useChatSearch({
    roomId: room.id,
    onFetchAround: fetchAroundMessage,
  });

  // Manage chat scroll, restoration and sticky dates
  const chatScroll = useChatScroll({
    roomId: room.id,
    messages,
    currentUserId: currentUser.id,
    hasTypingUsers: Object.keys(typingUsers).length > 0,
    onLoadOlder: loadOlder,
  });

  // Check and refresh E2EE room encryption status
  useEffect(() => {
    let cancelled = false;
    setEncryption("checking");

    getRoomEncryption(room.id)
      .then((info) => {
        if (cancelled) return;

        const missing = info.members
          .filter((m) => !m.hasKeys && m.userId !== currentUser.id)
          .map((m) => m.name);
        const iHaveKeys = info.members.some(
          (m) => m.userId === currentUser.id && m.hasKeys,
        );

        setPendingNames(missing);
        setEncryption(
          info.encrypted ||
            room.encrypted ||
            (missing.length === 0 && iHaveKeys)
            ? "active"
            : "pending",
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPendingNames([]);
          setEncryption("pending");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [room.id, room.encrypted, currentUser.id, e2ee.status, rosterVersion]);

  // Invalidate encryption directory cache on member join or leave
  useEffect(() => {
    if (!socket) return;

    const refresh = ({ roomId }) => {
      if (roomId !== room.id) return;
      clearRoomEncryptionCache(room.id);
      setRosterVersion((n) => n + 1);
    };

    socket.on("room:member-added", refresh);
    socket.on("room:member-removed", refresh);
    return () => {
      socket.off("room:member-added", refresh);
      socket.off("room:member-removed", refresh);
    };
  }, [socket, room.id]);

  // Initial message history load via REST
  useEffect(() => {
    if (e2ee.status === "idle" || e2ee.status === "loading") return;

    let cancelled = false;
    setIsLoading(true);
    setMessages([]);
    setHasMore(true);
    setIsLoadingMore(false);
    loadingMoreRef.current = false;

    getRoomMessagesRequest(room.id, { limit: PAGE_SIZE })
      .then(async ({ data }) => {
        const readable = await decryptMessages(data.messages, {
          roomId: room.id,
          userId: currentUser.id,
        });

        if (cancelled) return;
        chatScroll.scrollAction.current = "initial";
        setMessages(readable);
        cacheDecryptedMessages(room.id, readable);
        setHasMore(data.messages.length === PAGE_SIZE);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id, e2ee.status, e2ee.historyVersion, currentUser.id]);

  // Real-time socket message and receipt events
  useEffect(() => {
    if (!socket) return;

    socket.emit("message:seen", { roomId: room.id });

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

    const handleNewMessage = async ({ roomId, message }) => {
      if (roomId !== room.id) return;

      const readable = await decryptMessage(message, {
        roomId: room.id,
        userId: currentUser.id,
      });

      setMessages((prev) => insertInOrder(prev, readable));
      cacheDecryptedMessages(room.id, [readable]);
      removeTyping(message.sender._id);
      socket.emit("message:seen", { roomId: room.id });
    };

    const handleDelivered = receiptHandler(["deliveredTo"]);
    const handleSeenUpdate = receiptHandler(["seenBy", "deliveredTo"]);

    const handleReactionUpdate = async ({ roomId, messageId, reactions }) => {
      if (roomId !== room.id) return;

      const target = messagesRef.current.find((m) => m._id === messageId);
      if (!target) return;

      const seq = (reactionSeq.current[messageId] =
        (reactionSeq.current[messageId] ?? 0) + 1);

      const shown = await decryptReactions(reactions, {
        secret: target.secret,
        roomId: room.id,
        messageId,
      });

      if (reactionSeq.current[messageId] !== seq) return;

      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions: shown } : m)),
      );
    };

    const handlePollVoteUpdate = async ({ roomId, messageId, votes }) => {
      if (roomId !== room.id) return;

      const target = messagesRef.current.find((m) => m._id === messageId);
      if (!target) return;

      const seq = (pollVoteSeq.current[messageId] =
        (pollVoteSeq.current[messageId] ?? 0) + 1);

      let shownVotes = votes;
      if (target.secret) {
        shownVotes = await decryptPollVotes(votes, {
          secret: target.secret,
          roomId: room.id,
          messageId,
        });
      }

      if (pollVoteSeq.current[messageId] !== seq) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== messageId || !m.poll) return m;
          return {
            ...m,
            poll: {
              ...m.poll,
              votes: shownVotes,
            },
          };
        }),
      );
    };

    const handleEdited = async ({
      roomId,
      messageId,
      text,
      e2ee,
      senderId,
      editedAt,
    }) => {
      if (roomId !== room.id) return;

      let newText = text;
      let decrypt;
      let secret;

      if (e2ee) {
        const readable = await decryptMessage(
          { encrypted: true, e2ee, sender: { _id: senderId } },
          { roomId: room.id, userId: currentUser.id },
        );
        newText = readable.text;
        decrypt = readable.decrypt;
        secret = readable.secret;
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (m._id === messageId) {
            const updated = {
              ...m,
              text: newText,
              e2ee: e2ee ?? m.e2ee,
              secret: secret ?? m.secret,
              decrypt: decrypt ?? m.decrypt,
              editedAt,
            };
            cacheDecryptedMessages(room.id, [updated]);
            return updated;
          }
          return m;
        }),
      );
    };

    const handleDeleted = ({ roomId, messageId, deletedAt }) => {
      if (roomId !== room.id) return;
      removeCachedMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                text: "",
                reactions: [],
                e2ee: undefined,
                media: null,
                replyTo: null,
                deletedAt,
              }
            : m,
        ),
      );
    };

    const handleSystemMessage = ({ roomId, message }) => {
      if (roomId !== room.id) return;
      setMessages((prev) => insertInOrder(prev, message));
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:delivered", handleDelivered);
    socket.on("message:seen-update", handleSeenUpdate);
    socket.on("message:reaction-update", handleReactionUpdate);
    socket.on("message:poll-vote-update", handlePollVoteUpdate);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);
    socket.on("message:system", handleSystemMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:delivered", handleDelivered);
      socket.off("message:seen-update", handleSeenUpdate);
      socket.off("message:reaction-update", handleReactionUpdate);
      socket.off("message:poll-vote-update", handlePollVoteUpdate);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
      socket.off("message:system", handleSystemMessage);
    };
  }, [socket, room.id, currentUser.id, removeTyping]);

  // Live incoming typing indicators
  useEffect(() => {
    if (!socket) return;

    const handleTypingStart = ({ roomId, userId, name, avatarUrl }) => {
      if (roomId !== room.id) return;
      const resolvedAvatar =
        avatarUrl ||
        (room.type === "private" ? room.avatarUrl : null) ||
        messages.find((m) => m.sender?._id === userId)?.sender?.avatarUrl ||
        "";
      setTypingUsers((prev) => ({
        ...prev,
        [userId]: { name, avatarUrl: resolvedAvatar },
      }));
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

  // Emit typing stop to socket
  const stopTyping = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (isTypingRef.current) {
      socket?.emit("typing:stop", { roomId: room.id });
      isTypingRef.current = false;
    }
  }, [socket, room.id]);

  useEffect(() => stopTyping, [stopTyping]);

  // Local user typing heartbeat
  const handleTyping = () => {
    if (!socket) return;
    const now = Date.now();
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

  // Drag and drop event handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      setDroppedFile(files[0]);
    }
  };

  // Encrypt and send outgoing message
  const handleSend = async (text, file, poll = null) => {
    if (!socket) return false;
    stopTyping();
    setSendError("");

    try {
      let mediaPayload = null;

      if (file) {
        const encrypted = await encryptMedia(file);
        const uploadRes = await uploadMediaRequest(encrypted.encryptedBlob, {
          encrypted: true,
          fileName: `${file.name}.enc`,
        });

        mediaPayload = {
          url: uploadRes.data.url,
          publicId: uploadRes.data.publicId,
          key: encrypted.mediaKey,
          iv: encrypted.mediaIv,
          fileName: encrypted.fileName,
          fileType: encrypted.fileType,
          fileSize: encrypted.fileSize,
          isGif: Boolean(file.isGif),
        };
      }

      const attempt = async () => {
        const payload = await buildOutgoingMessage({
          room,
          currentUser,
          text,
          media: mediaPayload,
          poll,
          replyTo: replyingTo
            ? {
                messageId: replyingTo.messageId,
                senderName: replyingTo.senderName,
                text: replyingTo.text,
                mediaType: replyingTo.mediaType,
              }
            : null,
        });

        return new Promise((resolve) => {
          socket
            .timeout(15000)
            .emit(
              "message:send",
              { roomId: room.id, ...payload },
              (err, response) =>
                resolve(
                  err
                    ? {
                        success: false,
                        message: "No response from the server.",
                      }
                    : response,
                ),
            );
        });
      };

      let ack = await attempt();

      if (!ack?.success && ack?.message?.includes("members changed")) {
        clearRoomEncryptionCache(room.id);
        ack = await attempt();
      }

      if (!ack?.success) {
        const errorMsg = ack?.message || "Message failed to send.";
        setSendError(errorMsg);
        toast.error(errorMsg);
        return false;
      }

      setReplyingTo(null);
      return true;
    } catch (err) {
      console.error("Message failed to send:", err);
      const errorMsg = err.message || "Couldn't send that message.";
      setSendError(errorMsg);
      toast.error(errorMsg);
      return false;
    }
  };

  // React to a message
  const handleReact = async (messageId, emoji) => {
    if (!socket) return;
    const message = messages.find((m) => m._id === messageId);
    if (!message) return;

    try {
      const payload = await buildReactionRequest({
        message,
        emoji,
        roomId: room.id,
        currentUserId: currentUser.id,
      });

      const ack = await new Promise((resolve) => {
        socket
          .timeout(10000)
          .emit(
            "message:react",
            { roomId: room.id, messageId, ...payload },
            (err, response) =>
              resolve(
                err
                  ? { success: false, message: "No response from the server." }
                  : response,
              ),
          );
      });

      if (!ack?.success) {
        const errorMsg = ack?.message || "Couldn't save that reaction.";
        setSendError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message || "Couldn't save that reaction.";
      setSendError(errorMsg);
      toast.error(errorMsg);
    }
  };

  // Vote on a poll
  const handlePollVote = async (messageId, selectedOptionIds) => {
    if (!socket) return;
    const message = messages.find((m) => m._id === messageId);
    if (!message) return;

    try {
      const payload = await buildPollVoteRequest({
        message,
        selectedOptionIds,
        roomId: room.id,
        currentUserId: currentUser.id,
      });

      const ack = await new Promise((resolve) => {
        socket
          .timeout(10000)
          .emit(
            "message:poll-vote",
            { roomId: room.id, messageId, ...payload },
            (err, response) =>
              resolve(
                err
                  ? { success: false, message: "No response from the server." }
                  : response,
              ),
          );
      });

      if (!ack?.success) {
        toast.error(ack?.message || "Couldn't record your vote.");
      }
    } catch (err) {
      toast.error(err.message || "Couldn't record your vote.");
    }
  };

  // Edit an existing message
  const handleEditMessage = async (messageId, text) => {
    if (!socket) return;
    const original = messages.find((m) => m._id === messageId);

    try {
      const payload = await buildOutgoingMessage({
        room,
        currentUser,
        text,
        secret: original?.secret ?? undefined,
      });
      if (!payload.e2ee) throw new Error("Couldn't encrypt that edit.");

      const ack = await new Promise((resolve) => {
        socket
          .timeout(10000)
          .emit(
            "message:edit",
            { roomId: room.id, messageId, ...payload },
            (err, response) =>
              resolve(
                err
                  ? { success: false, message: "No response from the server." }
                  : response,
              ),
          );
      });

      if (!ack?.success) {
        toast.error(ack?.message || "Couldn't edit that message.");
      } else {
        toast.success("Message edited");
      }
    } catch (err) {
      toast.error(err.message || "Couldn't edit that message.");
    }
  };

  // Delete a message
  const handleDeleteMessage = (messageId, mediaPublicId) => {
    if (!socket) return;
    const msg = messages.find((m) => m._id === messageId);
    const targetPublicId = mediaPublicId || msg?.media?.publicId || undefined;
    socket.emit(
      "message:delete",
      { roomId: room.id, messageId, mediaPublicId: targetPublicId },
      (ack) => {
        if (!ack?.success) {
          toast.error(ack?.message || "Couldn't delete that message.");
        } else {
          toast.success("Message deleted");
        }
      },
    );
  };

  // Determine transition point where encryption started
  const encryptionStartsAt = useMemo(() => {
    let sawPlaintext = false;
    for (const m of messages) {
      if (m.type === "system") continue;
      if (!m.encrypted) sawPlaintext = true;
      else if (sawPlaintext) return m._id;
    }
    return null;
  }, [messages]);

  // Format typing indicators and subtitle
  const typingList = Object.entries(typingUsers).map(([id, info]) => ({
    id,
    name: typeof info === "object" ? info.name : info,
    avatarUrl: typeof info === "object" ? info.avatarUrl : "",
  }));

  let typingText = "";
  if (typingList.length > 0) {
    if (room.type === "private") typingText = "typing…";
    else if (typingList.length === 1)
      typingText = `${typingList[0].name} is typing…`;
    else
      typingText = `${typingList
        .slice(0, 2)
        .map((u) => u.name)
        .join(", ")}${typingList.length > 2 ? " and others" : ""} are typing…`;
  }

  let subtitle;
  if (typingText) {
    subtitle = (
      <span className="flex items-center gap-1.5 font-medium text-primary animate-pulse">
        <span>{typingText}</span>
      </span>
    );
  } else if (room.type === "group") {
    subtitle = `${room.memberCount} members`;
  } else if (room.status === "online") {
    subtitle = <span className="text-primary">Online</span>;
  } else {
    subtitle = formatLastSeen(room.lastSeen);
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & drop overlay */}
      <ChatDropOverlay isDraggingOver={isDraggingOver} />

      {/* Top chat header */}
      <ChatHeader
        room={room}
        subtitle={subtitle}
        onOpenSidebar={onOpenSidebar}
        onOpenMembers={onOpenMembers}
        isSearchOpen={chatSearch.isSearchOpen}
        onToggleSearch={() => {
          if (chatSearch.isSearchOpen) {
            chatSearch.closeSearch();
          } else {
            chatSearch.setIsSearchOpen(true);
          }
        }}
        contactStatus={contactStatus}
        encryption={encryption}
        onVerifyUser={setVerifyUserId}
        initiateCall={initiateCall}
      />

      {/* Expandable in-chat search bar */}
      {chatSearch.isSearchOpen && (
        <MessageSearchBar
          query={chatSearch.searchQuery}
          onQueryChange={(q) => chatSearch.handleSearchQueryChange(q, messages)}
          matches={chatSearch.searchResults}
          currentIndex={chatSearch.searchIndex}
          totalFound={chatSearch.searchResults.length}
          onNavigate={chatSearch.handleSearchNavigate}
          onClose={chatSearch.closeSearch}
          isSearching={chatSearch.isSearching}
        />
      )}

      {/* Message scroll container and floating indicators */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Floating sticky date pill */}
        <ChatStickyDate
          visible={chatScroll.showStickyDate}
          date={chatScroll.stickyDate}
          scrollbarWidth={chatScroll.scrollbarWidth}
        />

        {/* Scrollable message timeline */}
        <div
          ref={chatScroll.scrollRef}
          onScroll={chatScroll.handleScroll}
          className="flex-1 overflow-y-auto p-4"
        >
          <KeyChangeNotice
            changes={changedContacts}
            onReview={setVerifyUserId}
          />
          {!isLoading && encryption === "active" && (
            <EncryptionNotice
              kind="active"
              name={room.name}
              isGroup={room.type === "group"}
            />
          )}
          {!isLoading && encryption === "pending" && (
            <EncryptionNotice kind="pending" names={pendingNames} />
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet — say hello.
            </p>
          ) : (
            messages.map((m, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const msgDate = new Date(m.createdAt).toDateString();
              const prevDate = prevMsg
                ? new Date(prevMsg.createdAt).toDateString()
                : null;
              const showDateSeparator = !prevDate || msgDate !== prevDate;
              const dateLabel = showDateSeparator
                ? formatDateSeparator(m.createdAt)
                : null;

              return (
                <React.Fragment key={m._id}>
                  {showDateSeparator && dateLabel && (
                    <div
                      data-date-separator="true"
                      data-date-label={dateLabel}
                      className="my-3 flex justify-center select-none"
                    >
                      <span className="rounded-full border border-border/60 bg-muted/90 px-3.5 py-1 font-sans text-xs font-semibold text-muted-foreground shadow-xs backdrop-blur-md">
                        {dateLabel}
                      </span>
                    </div>
                  )}
                  {m.type === "system" ? (
                    <SystemMessage
                      key={m._id}
                      message={m}
                      currentUserId={currentUser.id}
                    />
                  ) : (
                    <>
                      {m._id === encryptionStartsAt && (
                        <EncryptionNotice kind="started" name={room.name} />
                      )}
                      <MessageBubble
                        message={m}
                        isOwn={m.sender._id === currentUser.id}
                        isGroup={room.type === "group"}
                        recipientCount={recipientCount}
                        currentUserId={currentUser.id}
                        editable={m.decrypt === "ok"}
                        onReact={handleReact}
                        onVote={handlePollVote}
                        onReply={(replyData) => setReplyingTo(replyData)}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                      />
                    </>
                  )}
                </React.Fragment>
              );
            })
          )}

          {/* Typing indicator bubble */}
          <TypingIndicator
            typers={typingList}
            isGroup={room.type === "group"}
          />

          <div ref={chatScroll.bottomRef} />
        </div>

        {/* Scroll-to-bottom floating button */}
        <ChatScrollBottom
          visible={chatScroll.showScrollBottom}
          unreadCount={chatScroll.unreadCount}
          onClick={chatScroll.scrollToBottom}
        />
      </div>

      {sendError && (
        <p role="alert" className="px-4 pb-1 text-xs text-destructive">
          {sendError}
        </p>
      )}

      {/* Message input bar */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        droppedFile={droppedFile}
        onClearDroppedFile={() => setDroppedFile(null)}
        isEncrypted={encryption === "active" || room.encrypted}
      />

      {/* Safety number dialog */}
      <SafetyNumberDialog
        open={Boolean(verifyUserId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setVerifyUserId(null);
        }}
        me={{ id: currentUser.id, devices: verification.myDevices }}
        contact={verifyUserId ? verification.statuses[verifyUserId] : null}
      />
    </div>
  );
}
