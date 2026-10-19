import React, { useEffect, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const hasMatches = matches.length > 0;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="relative flex-1 flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages in this chat…"
          className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            title="Clear query"
            className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Match indicator & navigation */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground select-none shrink-0">
        {isSearching ? (
          <div className="flex items-center gap-1.5 px-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-[11px]">Searching…</span>
          </div>
        ) : query.trim() ? (
          hasMatches ? (
            <span className="px-2 font-mono text-[11px] font-medium text-foreground">
              {currentIndex + 1} of {totalFound}
            </span>
          ) : (
            <span className="px-2 text-[11px] text-muted-foreground">
              No results
            </span>
          )
        ) : null}

        {/* Previous match (chronologically newer) */}
        <button
          type="button"
          onClick={() => onNavigate("prev")}
          disabled={!hasMatches}
          title="Previous match (Shift + Enter)"
          aria-label="Previous match"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        {/* Next match (chronologically older) */}
        <button
          type="button"
          onClick={() => onNavigate("next")}
          disabled={!hasMatches}
          title="Next match (Enter)"
          aria-label="Next match"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Close search */}
        <button
          type="button"
          onClick={onClose}
          title="Close search (Esc)"
          aria-label="Close search"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
