import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Manages chat scroll restoration, pagination triggers, sticky dates, and scroll-to-bottom buttons
export function useChatScroll({
  roomId,
  messages,
  currentUserId,
  hasTypingUsers,
  onLoadOlder,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const scrollAction = useRef("append");
  const prevScrollHeight = useRef(0);
  const lastMessageIdRef = useRef(null);
  const stickyDateTimerRef = useRef(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stickyDate, setStickyDate] = useState("");
  const [showStickyDate, setShowStickyDate] = useState(false);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Smoothly scroll to the bottom of the conversation
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
    setShowScrollBottom(false);
    isNearBottomRef.current = true;
  }, []);

  // Handle scroll events: pagination, scroll-to-bottom button visibility, and sticky date detection
  const handleScroll = (e) => {
    const container = e.currentTarget;

    // Trigger pagination when scrolled near the top
    if (container.scrollTop < 100 && onLoadOlder) {
      onLoadOlder();
    }

    // Scroll-to-bottom button and unread indicator visibility
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    isNearBottomRef.current = isNearBottom;

    if (isNearBottom) {
      setShowScrollBottom(false);
      setUnreadCount(0);
    } else {
      setShowScrollBottom(true);
    }

    // WhatsApp-style floating sticky date indicator
    const separators = container.querySelectorAll("[data-date-separator]");
    if (separators.length === 0) return;

    const topEdge = container.getBoundingClientRect().top;
    let activeDate = "";
    for (const sep of separators) {
      const sepRect = sep.getBoundingClientRect();
      if (sepRect.top <= topEdge + 10) {
        activeDate = sep.getAttribute("data-date-label") || "";
      } else {
        break;
      }
    }

    if (activeDate) {
      setStickyDate(activeDate);
      setShowStickyDate(true);

      clearTimeout(stickyDateTimerRef.current);
      stickyDateTimerRef.current = setTimeout(() => {
        setShowStickyDate(false);
      }, 3000);
    } else {
      setShowStickyDate(false);
      clearTimeout(stickyDateTimerRef.current);
    }
  };

  // Manage scroll position and scrolling animations on message list changes
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (scrollAction.current === "prepend") {
      el.scrollTop = el.scrollHeight - prevScrollHeight.current;
    } else if (scrollAction.current === "initial") {
      el.scrollTop = el.scrollHeight;
      isNearBottomRef.current = true;
      setShowScrollBottom(false);
      setUnreadCount(0);
    } else {
      const lastMsg = messages[messages.length - 1];
      const lastId = lastMsg?._id;

      if (lastId && lastId !== lastMessageIdRef.current) {
        const isOwn = lastMsg.sender?._id === currentUserId;

        if (isOwn || isNearBottomRef.current) {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          setUnreadCount(0);
        } else {
          setUnreadCount((c) => c + 1);
          setShowScrollBottom(true);
        }
      }
    }

    lastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
    scrollAction.current = "append";
  }, [messages, currentUserId]);

  // Measure scrollbar width for precision alignment of sticky date pill
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollbarWidth(el.offsetWidth - el.clientWidth);
  }, [messages]);

  useEffect(() => {
    const handleResize = () => {
      if (scrollRef.current) {
        setScrollbarWidth(
          scrollRef.current.offsetWidth - scrollRef.current.clientWidth,
        );
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-scroll when incoming typing indicator appears and user is near bottom
  useEffect(() => {
    if (hasTypingUsers && isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [hasTypingUsers]);

  // Reset scroll and sticky date states on room change
  useEffect(() => {
    setShowStickyDate(false);
    setStickyDate("");
    clearTimeout(stickyDateTimerRef.current);
    setShowScrollBottom(false);
    setUnreadCount(0);
    isNearBottomRef.current = true;
  }, [roomId]);

  useEffect(() => {
    return () => clearTimeout(stickyDateTimerRef.current);
  }, []);

  return {
    scrollRef,
    bottomRef,
    scrollAction,
    prevScrollHeight,
    isNearBottomRef,
    showScrollBottom,
    unreadCount,
    stickyDate,
    showStickyDate,
    scrollbarWidth,
    scrollToBottom,
    handleScroll,
  };
}
