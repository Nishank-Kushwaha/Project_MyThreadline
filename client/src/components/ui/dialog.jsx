import * as React from "react";

export function Dialog({ open, onOpenChange, children }) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        {children}
      </div>
    </div>
  );
}
