import React, { lazy, Suspense, useEffect, useState } from "react";

// Lazy so the picker only downloads when first opened
const GifPickerPopover = lazy(() =>
  import("./GifPickerPopover").then((m) => ({ default: m.GifPickerPopover })),
);

// "GIF" button in the message bar that opens the picker
export function GifPickerButton({ onSelect, disabled = false }) {
  const [open, setOpen] = useState(false);

  // Close the picker if the input gets disabled
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <>
      <button
        type="button" // never submits the message form
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Choose a GIF"
        aria-haspopup="dialog"
        title="Send a GIF"
        className="mb-1 flex h-8 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-wide text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        GIF
      </button>

      {open && (
        <Suspense fallback={null}>
          <GifPickerPopover onOpenChange={setOpen} onPick={onSelect} />
        </Suspense>
      )}
    </>
  );
}
