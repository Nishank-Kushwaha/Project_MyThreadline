import React from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";

import { usePickerTheme } from "@/features/chat/hooks/usePickerTheme";

// Centered emoji picker over a backdrop; lazy-loaded so its emoji data stays out of the main bundle
export function EmojiPickerPopover({ onOpenChange, onPick }) {
  const pickerTheme = usePickerTheme() === "dark" ? Theme.DARK : Theme.LIGHT;

  const close = () => onOpenChange(false);

  const handleEmojiClick = (emojiData) => {
    onPick(emojiData.emoji);
    close();
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="relative z-10">
        <EmojiPicker
          theme={pickerTheme}
          autoFocusSearch
          lazyLoadEmojis
          onEmojiClick={handleEmojiClick}
        />
      </div>
    </div>
  );
}
