import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { GifPicker } from "gif-picker-react";
import { Giphy } from "gif-picker-react/providers/giphy";
import "gif-picker-react/style.css";

import { usePickerTheme } from "@/features/chat/hooks/usePickerTheme";

// Centered GIF picker over a backdrop; lazy-loaded from GifPickerButton
export function GifPickerPopover({ onOpenChange, onPick }) {
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
  const pickerTheme = usePickerTheme();

  const provider = useMemo(
    () => (apiKey ? Giphy(apiKey, { lang: "en", rating: "pg" }) : null),
    [apiKey],
  );

  // Escape closes the picker
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const close = () => onOpenChange(false);

  const handleGifClick = (gif) => {
    onPick(gif);
    close();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="GIF picker"
      className="fixed inset-0 z-70 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="gif-popover relative z-10">
        {provider ? (
          <GifPicker
            provider={provider}
            theme={pickerTheme}
            autoFocusSearch
            width="min(350px, calc(100vw - 2rem))"
            height={450}
            onGifClick={handleGifClick}
          />
        ) : (
          <div className="rounded-lg border border-border bg-background p-4 text-xs text-destructive">
            GIF search isn't configured (missing VITE_KLIPY_API_KEY).
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
