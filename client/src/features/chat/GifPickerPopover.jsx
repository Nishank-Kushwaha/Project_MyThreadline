import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { GifPicker } from "gif-picker-react";
import { Klipy } from "gif-picker-react/providers/klipy";
import "gif-picker-react/style.css";
import { usePickerTheme } from "@/context/usePickerTheme";

// Same overlay pattern as EmojiPickerPopover (backdrop + centered card).
// Lazy-loaded from GifPickerButton, so it only downloads when first opened.
export function GifPickerPopover({ onOpenChange, onPick }) {
  const apiKey = import.meta.env.VITE_KLIPY_API_KEY;
  const pickerTheme = usePickerTheme();

  const provider = useMemo(
    () =>
      apiKey ? Klipy(apiKey, { locale: "en_IN", showBranding: true }) : null,
    [apiKey],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="GIF picker"
      className="fixed inset-0 z-70 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div className="gif-popover relative z-10">
        {provider ? (
          <GifPicker
            provider={provider}
            theme={pickerTheme}
            autoFocusSearch
            width="min(350px, calc(100vw - 2rem))"
            height={450}
            onGifClick={(gif) => {
              onPick(gif);
              onOpenChange(false);
            }}
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
