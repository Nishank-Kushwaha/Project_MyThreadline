import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

export function MessageInput({ onSend, onTyping }) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef(null);

  // Grow with the text. The CSS max-h (8 lines) stops the growth,
  // and overflow-y-auto turns the box into a scroller after that.
  const fit = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Re-fit on every text change (also shrinks it back after sending)
  useLayoutEffect(fit, [text, fit]);

  // Re-fit when the box gets wider/narrower (e.g. the sidebar is dragged),
  // because the text then wraps into a different number of lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  const handleChange = (e) => {
    setText(e.target.value);
    if (e.target.value) onTyping?.(); // tell the parent "the user is typing"
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      // onSend returns false when the message wasn't sent: keep what was typed.
      const sent = await onSend(trimmed);
      if (sent !== false) setText("");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus(); // keep typing without clicking again
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send();
  };

  // Enter sends, Shift+Enter adds a new line (like WhatsApp Web).
  // On phones/tablets (touch) Enter always adds a new line; use the button.
  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    send();
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-end gap-2 rounded-3xl border border-input bg-secondary/40 py-1 pl-2 pr-1 focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message…"
          aria-label="Message"
          autoComplete="off"
          className="max-h-52 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent px-2 py-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none scrollbar-thin"
        />

        <Button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="h-10 w-10 shrink-0 rounded-full p-0"
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </form>
  );
}
