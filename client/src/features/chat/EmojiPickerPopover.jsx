import React from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";

// Reuses the same overlay pattern as components/ui/dialog.jsx (backdrop +
// centered card) rather than pixel-precise anchoring next to the bubble —
// simpler, and consistent with how the rest of the app opens overlays.
//
// This is lazy-loaded from MessageBubble.jsx (only mounted while actually
// open) — emoji-picker-react bundles its full emoji dataset, which added
// ~340KB to the main bundle when it was a normal top-level import. Nobody
// should pay that cost just for opening the app, only for opening the picker.
export function EmojiPickerPopover({ onOpenChange, onPick }) {
  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10">
        <EmojiPicker
          theme={Theme.DARK}
          autoFocusSearch
          lazyLoadEmojis
          onEmojiClick={(emojiData) => {
            onPick(emojiData.emoji);
            onOpenChange(false);
          }}
        />
      </div>
    </div>
  );
}
