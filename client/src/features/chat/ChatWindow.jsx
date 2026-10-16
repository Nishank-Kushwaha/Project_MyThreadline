import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Menu, Shield, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { getRoomMessagesRequest } from "@/api/roomsApi";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { cn, formatLastSeen } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { SystemMessage } from "./SystemMessage";
import { EncryptionNotice } from "./EncryptionNotice";
import { useE2EE } from "@/features/e2ee/E2EEContext";
import { KeyChangeNotice } from "./KeyChangeNotice";
import { useRoomVerification } from "@/features/e2ee/useVerification";
import { SafetyNumberDialog } from "@/features/e2ee/SafetyNumberDialog";
import {
  clearRoomEncryptionCache,
  getRoomEncryption,
} from "@/lib/e2ee/directory";
import {
  buildOutgoingMessage,
  buildReactionRequest,
  decryptMessage,
  decryptMessages,
  decryptReactions,
} from "@/lib/e2ee/messages";
import { encryptMedia } from "@/lib/e2ee/media";
import { uploadMediaRequest } from "@/api/mediaApi";

const TYPING_IDLE_MS = 1500; // I stop typing => tell others after this much silence
const TYPING_REFRESH_MS = 2500; // while I keep typing, re-announce this often
const TYPING_EXPIRE_MS = 4000; // safety net: hide someone else's indicator if "stop" never arrives

const PAGE_SIZE = 30; // how many messages to fetch at once

// Decrypting is async, so two messages that arrive close together can finish
// out of order. Insert by time instead of always appending.
function insertInOrder(list, message) {
  if (list.some((m) => m._id === message._id)) return list;

  const time = new Date(message.createdAt).getTime();
  let index = list.length;

  while (index > 0 && new Date(list[index - 1].createdAt).getTime() > time) {
    index -= 1;
  }

  return [...list.slice(0, index), message, ...list.slice(index)];
}

export function ChatWindow({
  room,
  currentUser,
  socket,
  onOpenSidebar,
  onOpenMembers,
}) {
  const e2ee = useE2EE();

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({}); // { [userId]: name }
  const [sendError, setSendError] = useState("");
  const [encryption, setEncryption] = useState("checking"); // "off" (groups) | "checking" | "active" | "pending"
  const [pendingNames, setPendingNames] = useState([]); // members without a key
  const [rosterVersion, setRosterVersion] = useState(0); // bump to re-check

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [verifyUserId, setVerifyUserId] = useState(null);

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

  const messagesRef = useRef([]); // latest messages, for use inside socket handlers
  messagesRef.current = messages;
  const reactionSeq = useRef({}); // messageId -> newest reaction update number

  const recipientCount = room.memberCount - 1; // everyone except me

  const verification = useRoomVerification({
    room,
    currentUserId: currentUser.id,
    socket,
  });

  // Verified contacts whose keys changed since you verified them.
  const changedContacts = Object.values(verification.statuses).filter(
    (status) => status.state === "changed",
  );

  const contactStatus =
    room.type === "private" ? verification.statuses[room.otherUserId] : null;
  const ContactShield =
    contactStatus?.state === "verified"
      ? ShieldCheck
      : contactStatus?.state === "changed"
        ? ShieldAlert
        : Shield;

  const removeTyping = useCallback((userId) => {
    clearTimeout(expireTimers.current[userId]);
    setTypingUsers((prev) => {
      const { [userId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // ---------- 0) Is this chat encrypted (or about to be)? ----------
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

  // Someone joined or left: the next send must use a fresh member list.
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

  // ---------- 1) History over REST ----------
  useEffect(() => {
    // Wait for this device's key to be ready, or encrypted messages would all
    // show as undecryptable.
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
        scrollAction.current = "initial";
        setMessages(readable);
        setHasMore(data.messages.length === PAGE_SIZE);
        setIsLoading(false); // same tick as setMessages so the scroll effect sees real content
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room.id, e2ee.status, e2ee.historyVersion, currentUser.id]);

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

      const readable = await decryptMessages(data.messages, {
        roomId: room.id,
        userId: currentUser.id,
      });
      if (activeRoomRef.current !== requestedRoom) return;

      prevScrollHeight.current = scrollRef.current.scrollHeight;
      scrollAction.current = "prepend";

      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m._id));
        return [...readable.filter((m) => !existing.has(m._id)), ...prev];
      });
      setHasMore(data.messages.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, messages, room.id, currentUser.id]);

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

    const handleNewMessage = async ({ roomId, message }) => {
      if (roomId !== room.id) return;

      const readable = await decryptMessage(message, {
        roomId: room.id,
        userId: currentUser.id,
      });

      setMessages((prev) => insertInOrder(prev, readable));
      removeTyping(message.sender._id); // they sent it, so they're no longer "typing"
      socket.emit("message:seen", { roomId: room.id }); // still open => still seen
    };
    const handleDelivered = receiptHandler(["deliveredTo"]);
    const handleSeenUpdate = receiptHandler(["seenBy", "deliveredTo"]); // seen implies delivered
    // A reaction changed on some message in this room. Sealed reactions are
    // opened here with that message's secret.
    const handleReactionUpdate = async ({ roomId, messageId, reactions }) => {
      if (roomId !== room.id) return;

      const target = messagesRef.current.find((m) => m._id === messageId);
      if (!target) return;

      // Decrypting is async: only the newest update for a message may win.
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

    // Someone edited a message. A plaintext edit carries the new text; an
    // encrypted edit carries a new envelope that is decrypted here.
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
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                text: newText,
                e2ee: e2ee ?? m.e2ee,
                secret: secret ?? m.secret,
                decrypt: decrypt ?? m.decrypt,
                editedAt,
              }
            : m,
        ),
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
            ? { ...m, text: "", reactions: [], e2ee: undefined, deletedAt }
            : m,
        ),
      );
    };
    // Group events ("Carol left"). The id check guards against the same event
    // arriving both live and in a history fetch.
    const handleSystemMessage = ({ roomId, message }) => {
      if (roomId !== room.id) return;
      setMessages((prev) => insertInOrder(prev, message));
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:delivered", handleDelivered);
    socket.on("message:seen-update", handleSeenUpdate);
    socket.on("message:reaction-update", handleReactionUpdate);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);
    socket.on("message:system", handleSystemMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:delivered", handleDelivered);
      socket.off("message:seen-update", handleSeenUpdate);
      socket.off("message:reaction-update", handleReactionUpdate);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
      socket.off("message:system", handleSystemMessage);
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

  // Returns false when the message wasn't sent, so the input keeps the text.
  const handleSend = async (text, file) => {
    if (!socket) return false;
    stopTyping();
    setSendError("");

    try {
      let mediaPayload = null;

      if (file) {
        const isEncrypted = encryption === "active" || room.encrypted;

        if (isEncrypted) {
          // 1. Encrypt file client-side using AES-GCM
          const encrypted = await encryptMedia(file);

          // 2. Upload the encrypted binary blob to storage
          const uploadRes = await uploadMediaRequest(encrypted.encryptedBlob, {
            encrypted: true,
            fileName: `${file.name}.enc`,
          });

          // 3. Media payload to be packed INSIDE the E2EE envelope
          mediaPayload = {
            url: uploadRes.data.url,
            publicId: uploadRes.data.publicId,
            key: encrypted.mediaKey,
            iv: encrypted.mediaIv,
            fileName: encrypted.fileName,
            fileType: encrypted.fileType,
            fileSize: encrypted.fileSize,
          };
        } else {
          // 1. Upload unencrypted file directly to storage
          const uploadRes = await uploadMediaRequest(file, {
            encrypted: false,
            fileName: file.name,
          });

          // 2. Normal unencrypted media payload
          mediaPayload = {
            url: uploadRes.data.url,
            publicId: uploadRes.data.publicId,
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
          };
        }
      }

      const attempt = async () => {
        const payload = await buildOutgoingMessage({
          room,
          currentUser,
          text,
          media: mediaPayload,
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
                    ? { success: false, message: "No response from the server." }
                    : response,
                ),
            );
        });
      };

      let ack = await attempt();

      // Someone joined while this was being encrypted: re-read the member
      // list and try once more.
      if (!ack?.success && ack?.message?.includes("members changed")) {
        clearRoomEncryptionCache(room.id);
        ack = await attempt();
      }

      if (!ack?.success) {
        setSendError(ack?.message || "Message failed to send.");
        return false;
      }

      return true;
    } catch (err) {
      console.error("Message failed to send:", err);
      setSendError(err.message || "Couldn't send that message.");
      return false;
    }
  };

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
        setSendError(ack?.message || "Couldn't save that reaction.");
      }
    } catch (err) {
      setSendError(err.message || "Couldn't save that reaction.");
    }
  };

  const handleEditMessage = async (messageId, text) => {
    if (!socket) return;

    const original = messages.find((m) => m._id === messageId);

    try {
      let payload = { text };

      // An edit of an encrypted message is encrypted for every current device.
      if (original?.encrypted) {
        payload = await buildOutgoingMessage({
          room,
          currentUser,
          text,
          secret: original.secret ?? undefined,
        });
        if (!payload.e2ee) throw new Error("Couldn't encrypt that edit.");
      }

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

      if (!ack?.success) alert(ack?.message || "Couldn't edit that message.");
    } catch (err) {
      alert(err.message || "Couldn't edit that message.");
    }
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

  // The first encrypted message that follows older plaintext ones: a divider
  // is drawn above it so the old messages are clearly labelled.
  const encryptionStartsAt = useMemo(() => {
    let sawPlaintext = false;

    for (const m of messages) {
      if (m.type === "system") continue;
      if (!m.encrypted) sawPlaintext = true;
      else if (sawPlaintext) return m._id;
    }

    return null;
  }, [messages]);

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
          <p className="truncate text-sm font-semibold">{room.name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {/* Private chats are always exactly 2 people, so there is nothing to manage. */}
        {contactStatus && encryption === "active" && (
          <button
            onClick={() => setVerifyUserId(room.otherUserId)}
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

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        <KeyChangeNotice changes={changedContacts} onReview={setVerifyUserId} />
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
          messages.map((m) =>
            m.type === "system" ? (
              <SystemMessage
                key={m._id}
                message={m}
                currentUserId={currentUser.id}
              />
            ) : (
              <React.Fragment key={m._id}>
                {m._id === encryptionStartsAt && (
                  <EncryptionNotice kind="started" name={room.name} />
                )}
                <MessageBubble
                  message={m}
                  isOwn={m.sender._id === currentUser.id}
                  isGroup={room.type === "group"}
                  recipientCount={recipientCount}
                  currentUserId={currentUser.id}
                  editable={
                    m.encrypted ? m.decrypt === "ok" : encryption !== "active"
                  }
                  onReact={handleReact}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              </React.Fragment>
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <p role="alert" className="px-4 pb-1 text-xs text-destructive">
          {sendError}
        </p>
      )}

      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        isEncrypted={encryption === "active" || room.encrypted}
      />
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
