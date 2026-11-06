import React, { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { listUsersRequest } from "@/features/chat/api/usersApi";
import { createRoomRequest } from "@/features/chat/api/roomsApi";

// Single user list item row with avatar, name, and selection checkmark
function UserSelectionItem({ user, isSelected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(user._id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-accent",
        isSelected && "bg-accent",
      )}
    >
      <Avatar
        src={user.avatarUrl}
        name={user.name}
        className="h-8 w-8 text-xs"
      />
      <span className="truncate text-sm">{user.name}</span>
      {isSelected && (
        <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
      )}
    </button>
  );
}

// Dialog modal to initiate a direct 1-on-1 chat or create a group conversation
export function NewChatDialog({ open, onOpenChange, onCreated }) {
  // Dialog state
  const [users, setUsers] = useState([]);
  const [mode, setMode] = useState("private");
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived submit validity
  const canSubmit =
    mode === "private"
      ? selectedIds.length === 1
      : groupName.trim().length > 0 && selectedIds.length >= 2;

  // Reset dialog state and fetch available users when opened
  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setGroupName("");
    setError("");
    setMode("private");
    listUsersRequest().then(({ data }) => setUsers(data.users));
  }, [open]);

  // Mode switching
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setSelectedIds([]);
    setError("");
  };

  // Toggle user selection
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

  // Submit chat or group creation
  const handleCreate = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      const payload =
        mode === "private"
          ? { type: "private", memberId: selectedIds[0] }
          : { type: "group", name: groupName.trim(), memberIds: selectedIds };
      const { data } = await createRoomRequest(payload);
      toast.success(mode === "private" ? "Chat created" : "Group created");
      onCreated(data.room);
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't start that chat.";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mode toggle tabs */}
      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant={mode === "private" ? "default" : "outline"}
          size="sm"
          onClick={() => switchMode("private")}
        >
          Direct message
        </Button>
        <Button
          type="button"
          variant={mode === "group" ? "default" : "outline"}
          size="sm"
          onClick={() => switchMode("group")}
        >
          New group
        </Button>
      </div>

      {/* Group name input field */}
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

      {/* User list */}
      <div className="mb-4 max-h-64 space-y-1 overflow-y-auto">
        {users.map((u) => (
          <UserSelectionItem
            key={u._id}
            user={u}
            isSelected={selectedIds.includes(u._id)}
            onToggle={toggleUser}
          />
        ))}
        {users.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No other users yet — register a second account to chat with.
          </p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            "Start chat"
          )}
        </Button>
      </div>
    </Dialog>
  );
}
