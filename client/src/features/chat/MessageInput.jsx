import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

export function MessageInput({ onSend, onTyping }) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleChange = (e) => {
    setText(e.target.value);
    if (e.target.value) onTyping?.(); // tell the parent "the user is typing"
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      // onSend returns false when the message wasn't sent: keep what was typed.
      const sent = await onSend(trimmed);
      if (sent !== false) setText("");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border p-3"
    >
      <Input
        value={text}
        onChange={handleChange}
        placeholder="Type a message…"
        autoComplete="off"
      />
      <Button type="submit" disabled={!text.trim() || isSending}>
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
