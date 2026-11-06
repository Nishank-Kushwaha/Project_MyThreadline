import { useCallback, useEffect, useRef, useState } from "react";
import { searchLocalMessages } from "@/features/e2ee/lib/messageStore";

// Manages in-chat search queries, IndexedDB matching, match navigation, and element highlight jumps
export function useChatSearch({ roomId, onFetchAround }) {
  const searchTimeoutRef = useRef(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Scroll to and flash highlight target message element
  const jumpToMessage = useCallback(
    async (targetId) => {
      if (!targetId) return;

      const highlightElement = () => {
        const el = document.getElementById(`message-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("search-highlight-flash");
          void el.offsetWidth;
          el.classList.add("search-highlight-flash");
          setTimeout(() => el.classList.remove("search-highlight-flash"), 2200);
          return true;
        }
        return false;
      };

      if (highlightElement()) return;

      // Older page: request server fetch around the target message
      if (onFetchAround) {
        await onFetchAround(targetId);
        setTimeout(() => highlightElement(), 80);
      }
    },
    [onFetchAround],
  );

  const handleSearchQueryChange = (q, inMemoryMessages = []) => {
    setSearchQuery(q);
    clearTimeout(searchTimeoutRef.current);

    if (!q.trim()) {
      setSearchResults([]);
      setSearchIndex(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const localMatches = await searchLocalMessages(roomId, q);

      const qLower = q.trim().toLowerCase();
      const inMemoryMatches = inMemoryMessages
        .filter((m) => {
          if (m.type === "system") return false;
          const text = (m.text || "").toLowerCase();
          const fileName = (m.media?.fileName || "").toLowerCase();
          return text.includes(qLower) || fileName.includes(qLower);
        })
        .map((m) => ({
          id: m._id,
          text: m.text,
          fileName: m.media?.fileName,
          senderName: m.sender?.name,
          createdAt: new Date(m.createdAt).getTime(),
        }));

      const map = new Map();
      for (const item of inMemoryMatches) map.set(item.id, item);
      for (const item of localMatches) map.set(item.id, item);

      const allMatches = Array.from(map.values()).sort(
        (a, b) => b.createdAt - a.createdAt,
      );

      setSearchResults(allMatches);
      setSearchIndex(0);
      setIsSearching(false);

      if (allMatches.length > 0) {
        jumpToMessage(allMatches[0].id);
      }
    }, 200);
  };

  const handleSearchNavigate = (direction) => {
    if (searchResults.length === 0) return;
    let nextIndex;
    if (direction === "next") {
      nextIndex = (searchIndex + 1) % searchResults.length;
    } else {
      nextIndex =
        (searchIndex - 1 + searchResults.length) % searchResults.length;
    }
    setSearchIndex(nextIndex);
    jumpToMessage(searchResults[nextIndex].id);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchIndex(0);
    setIsSearching(false);
    clearTimeout(searchTimeoutRef.current);
  };

  // Reset search when active room changes
  useEffect(() => {
    closeSearch();
  }, [roomId]);

  useEffect(() => {
    return () => clearTimeout(searchTimeoutRef.current);
  }, []);

  return {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    searchResults,
    searchIndex,
    isSearching,
    handleSearchQueryChange,
    handleSearchNavigate,
    closeSearch,
    jumpToMessage,
  };
}
