import React, { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";

// Status indicator displaying current match count, search spinner, or no results label
function SearchStatus({
  isSearching,
  query,
  hasMatches,
  currentIndex,
  totalFound,
}) {
  if (isSearching) {
    return (
      <div className="flex items-center gap-1.5 px-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-[11px]">Searching…</span>
      </div>
    );
  }

  if (!query.trim()) return null;

  if (hasMatches) {
    return (
      <span className="px-2 font-mono text-[11px] font-medium text-foreground">
        {currentIndex + 1} of {totalFound}
      </span>
    );
  }

  return (
    <span className="px-2 text-[11px] text-muted-foreground">No results</span>
  );
}

// In-chat search bar with query input, result counter, match navigation, and shortcuts
export function MessageSearchBar({
  query,
  onQueryChange,
  matches = [],
  currentIndex = 0,
  onNavigate,
  onClose,
  isSearching = false,
  totalFound = 0,
}) {
  const inputRef = useRef(null);

  const hasMatches = matches.length > 0;

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation: Escape closes search, Enter / Shift+Enter navigates matches
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigate("prev");
      } else {
        onNavigate("next");
      }
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Search text input */}
      <div className="relative flex flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages in this chat…"
          className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground transition focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            title="Clear query"
            aria-label="Clear query"
            className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Match indicator & navigation controls */}
      <div className="flex shrink-0 select-none items-center gap-1 text-xs text-muted-foreground">
        <SearchStatus
          isSearching={isSearching}
          query={query}
          hasMatches={hasMatches}
          currentIndex={currentIndex}
          totalFound={totalFound}
        />

        {/* Previous match (Shift + Enter) */}
        <button
          type="button"
          onClick={() => onNavigate("prev")}
          disabled={!hasMatches}
          title="Previous match (Shift + Enter)"
          aria-label="Previous match"
          className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        {/* Next match (Enter) */}
        <button
          type="button"
          onClick={() => onNavigate("next")}
          disabled={!hasMatches}
          title="Next match (Enter)"
          aria-label="Next match"
          className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Close search button */}
        <button
          type="button"
          onClick={onClose}
          title="Close search (Esc)"
          aria-label="Close search"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
