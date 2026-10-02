import React, { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listUsersRequest } from "@/api/usersApi";
import { createRoomRequest } from "@/api/roomsApi";
import { cn, resolveAvatarUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export function NewChatDialog({ open, onOpenChange, onCreated }) {
  const [users, setUsers] = useState([]);
  const [mode, setMode] = useState("private"); // "private" | "group"
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setGroupName("");
    setError("");
    setMode("private");
    listUsersRequest().then(({ data }) => setUsers(data.users));
  }, [open]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setSelectedIds([]);
  };

  const toggleUser = (userId) => {
    if (mode === "private") {
      setSelectedIds([userId]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleCreate = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const payload =
        mode === "private"
          ? { type: "private", memberId: selectedIds[0] }
          : { type: "group", name: groupName, memberIds: selectedIds };
      const { data } = await createRoomRequest(payload);
      onCreated(data.room);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't start that chat.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    mode === "private"
      ? selectedIds.length === 1
      : groupName.trim().length > 0 && selectedIds.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="mb-4 flex gap-2">
        <Button
          variant={mode === "private" ? "default" : "outline"}
          size="sm"
          onClick={() => switchMode("private")}
        >
          Direct message
        </Button>
        <Button
          variant={mode === "group" ? "default" : "outline"}
          size="sm"
          onClick={() => switchMode("group")}
        >
          New group
        </Button>
      </div>

      {mode === "group" && (
        <div className="mb-4 space-y-2">
          <Label htmlFor="groupName">Group name</Label>
          <Input
            id="groupName"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Weekend trip"
          />
          <p className="text-xs text-muted-foreground">
            Pick at least 2 people below.
          </p>
        </div>
      )}

      <div className="mb-4 max-h-64 space-y-1 overflow-y-auto">
        {users.map((u) => {
          const avatar = resolveAvatarUrl(u.avatarUrl);
          const isSelected = selectedIds.includes(u._id);
          return (
            <button
              key={u._id}
              onClick={() => toggleUser(u._id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent",
                isSelected && "bg-accent",
              )}
            >
              <Avatar
                src={u.avatarUrl}
                name={u.name}
                className="h-8 w-8 text-xs"
              />
              <span className="text-sm">{u.name}</span>
              {isSelected && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </button>
          );
        })}
        {users.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No other users yet — register a second account to chat with.
          </p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Starting…" : "Start chat"}
        </Button>
      </div>
    </Dialog>
  );
}
