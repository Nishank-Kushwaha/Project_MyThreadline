import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  X,
  UserPlus,
  Crown,
  Pencil,
  Check,
  Camera,
  Trash2,
  Sparkles,
  Search,
  Loader2,
  LogOut,
  ShieldOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import {
  getRoomMembersRequest,
  addRoomMemberRequest,
  removeRoomMemberRequest,
  makeRoomAdminRequest,
  demoteRoomAdminRequest,
  updateGroupNameRequest,
  updateGroupAvatarRequest,
  removeGroupAvatarRequest,
  leaveRoomRequest,
} from "@/api/roomsApi";

import { listUsersRequest } from "@/api/usersApi";

// Lazy-loaded so the DiceBear collection stays out of the main bundle.
const AvatarPicker = lazy(() => import("@/components/ui/AvatarPicker"));

const MAX_GROUP_NAME = 50;

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;

/* ------------------------------------------------------------------ */
/* Group info panel                                                    */
/* ------------------------------------------------------------------ */

export function MembersPanel({
  open,
  onOpenChange,
  room,
  currentUserId,
  socket,
}) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // Group name / photo as shown in this panel (kept in sync with the room prop).
  const [info, setInfo] = useState({
    name: room.name,
    avatarUrl: room.avatarUrl,
  });

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameStatus, setNameStatus] = useState({ loading: false, error: "" });

  const [photoStatus, setPhotoStatus] = useState({
    loading: false,
    action: null,
    error: "",
  });
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    setInfo({ name: room.name, avatarUrl: room.avatarUrl });
  }, [room.id, room.name, room.avatarUrl]);

  // Admin status comes from the freshly loaded member list when available.
  const isAdmin =
    members.find((m) => m.id === currentUserId)?.isAdmin ?? room.isAdmin;

  const memberCount = isLoading ? room.memberCount : members.length;

  /* ----------------------------- loading ----------------------------- */

  const loadMembers = async () => {
    setIsLoading(true);
    setError("");

    try {
      const { data } = await getRoomMembersRequest(room.id);
      setMembers(data.members);
    } catch (err) {
      setError(apiMessage(err, "Couldn't load members."));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setMembers([]);
      setMemberSearch("");
      setIsEditingName(false);
      loadMembers();
    }
    // loadMembers is intentionally omitted from dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room.id]);

  useEffect(() => {
    if (!socket || !open) return;

    const refresh = ({ roomId }) => {
      if (roomId === room.id) loadMembers();
    };

    socket.on("room:member-added", refresh);
    socket.on("room:member-removed", refresh);
    socket.on("room:member-promoted", refresh);
    socket.on("room:member-demoted", refresh);

    return () => {
      socket.off("room:member-added", refresh);
      socket.off("room:member-removed", refresh);
      socket.off("room:member-promoted", refresh);
      socket.off("room:member-demoted", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, open, room.id]);

  // Lock page scroll behind the panel (important on phones).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes the panel, unless a dialog on top of it is open.
  const hasOverlay =
    isAddOpen || showPhoto || showPicker || Boolean(confirm) || isEditingName;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !hasOverlay) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hasOverlay, onOpenChange]);

  /* ----------------------------- actions ----------------------------- */

  const applyRoomUpdate = (updated) => {
    setInfo({ name: updated.name, avatarUrl: updated.avatarUrl });
  };

  const startEditingName = () => {
    setNameDraft(info.name || "");
    setNameStatus({ loading: false, error: "" });
    setIsEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();

    if (!trimmed) {
      setNameStatus({ loading: false, error: "Group name is required." });
      return;
    }
    if (trimmed === info.name) {
      setIsEditingName(false);
      return;
    }

    setNameStatus({ loading: true, error: "" });

    try {
      const { data } = await updateGroupNameRequest(room.id, trimmed);
      applyRoomUpdate(data.room);
      setNameStatus({ loading: false, error: "" });
      setIsEditingName(false);
    } catch (err) {
      setNameStatus({
        loading: false,
        error: apiMessage(err, "Couldn't rename the group."),
      });
    }
  };

  // Throws on failure so the avatar picker can show the message and stay open.
  const uploadGroupAvatar = async (file) => {
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setPhotoStatus({ loading: true, action: "upload", error: "" });

    try {
      const { data } = await updateGroupAvatarRequest(room.id, file);
      applyRoomUpdate(data.room);
      setPhotoStatus({ loading: false, action: null, error: "" });
    } catch (err) {
      const message = apiMessage(err, "Couldn't upload that image.");
      setPhotoStatus({ loading: false, action: null, error: message });
      throw new Error(message);
    } finally {
      setAvatarPreview(null);
      URL.revokeObjectURL(previewUrl);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      await uploadGroupAvatar(file);
    } catch {
      // The message is already shown under the photo.
    }
  };

  const removePhoto = async () => {
    setPhotoStatus({ loading: true, action: "remove", error: "" });

    try {
      const { data } = await removeGroupAvatarRequest(room.id);
      applyRoomUpdate(data.room);
      setShowPhoto(false);
      setPhotoStatus({ loading: false, action: null, error: "" });
    } catch (err) {
      setPhotoStatus({
        loading: false,
        action: null,
        error: apiMessage(err, "Couldn't remove the group photo."),
      });
    }
  };

  const removeMember = async (member) => {
    setError("");
    try {
      const { data } = await removeRoomMemberRequest(room.id, member.id);
      setMembers(data.members);
    } catch (err) {
      setError(apiMessage(err, "Couldn't remove that person."));
    }
  };

  const promoteMember = async (member) => {
    setError("");
    try {
      const { data } = await makeRoomAdminRequest(room.id, member.id);
      setMembers(data.members);
    } catch (err) {
      setError(apiMessage(err, "Couldn't make that person an admin."));
    }
  };

  const demoteMember = async (member) => {
    setError("");
    try {
      const { data } = await demoteRoomAdminRequest(room.id, member.id);
      setMembers(data.members);
    } catch (err) {
      setError(apiMessage(err, "Couldn't dismiss that person as admin."));
    }
  };

  const leaveGroup = async () => {
    setError("");
    try {
      await leaveRoomRequest(room.id);
      // Nothing else to do here: the server emits "room:removed" to this user
      // and the Dashboard removes the room and closes this panel.
    } catch (err) {
      setError(apiMessage(err, "Couldn't leave the group."));
    }
  };

  const askRemovePhoto = () =>
    setConfirm({
      title: "Remove group photo?",
      message: "Everyone will see the group's initial instead.",
      confirmLabel: "Remove photo",
      destructive: true,
      onConfirm: removePhoto,
    });

  const askRemoveMember = (member) =>
    setConfirm({
      title: `Remove ${member.name}?`,
      message: "They will no longer see messages in this group.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () => removeMember(member),
    });

  const askPromoteMember = (member) =>
    setConfirm({
      title: `Make ${member.name} an admin?`,
      message:
        "Admins can rename the group, change its photo and manage members.",
      confirmLabel: "Make admin",
      onConfirm: () => promoteMember(member),
    });

  const askDemoteMember = (member) =>
    setConfirm({
      title: `Dismiss ${member.name} as admin?`,
      message:
        "They'll stay in the group as a regular member and won't be able to rename it, change its photo or manage members.",
      confirmLabel: "Dismiss as admin",
      destructive: true,
      onConfirm: () => demoteMember(member),
    });

  const askLeaveGroup = () => {
    const isLastMember = members.length === 1;
    const isOnlyAdmin =
      isAdmin && !members.some((m) => m.isAdmin && m.id !== currentUserId);

    let message =
      "You'll no longer see messages in this group. Someone will need to add you back if you want to rejoin.";

    if (isLastMember) {
      message = "You're the last member, so this group will be deleted.";
    } else if (isOnlyAdmin) {
      message =
        "You're the only admin, so the longest-standing member will become admin. You'll no longer see messages in this group.";
    }

    setConfirm({
      title: "Leave this group?",
      message,
      confirmLabel: "Leave group",
      destructive: true,
      onConfirm: leaveGroup,
    });
  };

  /* ----------------------------- derived ----------------------------- */

  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return [...members]
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [members, memberSearch, currentUserId]);

  const isUploading = photoStatus.loading && photoStatus.action === "upload";
  const isRemoving = photoStatus.loading && photoStatus.action === "remove";
  const currentAvatar = avatarPreview || info.avatarUrl;

  if (!open) return null;

  /* ------------------------------ render ----------------------------- */

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop (desktop only matters; the panel covers the screen on phones) */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative z-10 flex h-dvh w-full flex-col bg-card md:max-w-sm md:border-l md:border-border">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="font-bold">Group info</p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Hero: photo + name */}
          <section className="flex flex-col items-center gap-4 border-b border-border px-4 py-6 text-center">
            <button
              type="button"
              disabled={!info.avatarUrl}
              onClick={() => setShowPhoto(true)}
              aria-label={
                info.avatarUrl ? "View group photo" : "No group photo"
              }
              className={cn(
                "relative rounded-full",
                info.avatarUrl &&
                  "cursor-pointer transition-transform hover:scale-105 active:scale-95",
              )}
            >
              <Avatar
                src={currentAvatar}
                name={info.name}
                alt="Group photo"
                className="h-28 w-28 text-3xl"
              />
              {photoStatus.loading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </span>
              )}
            </button>

            {/* Photo actions: admins only */}
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={photoStatus.loading}
                  onClick={() => setShowPicker(true)}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Avatar picker
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={photoStatus.loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="mr-1.5 h-4 w-4" />
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>

                {info.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 border border-input text-destructive hover:text-destructive"
                    disabled={photoStatus.loading}
                    onClick={askRemovePhoto}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    {isRemoving ? "Removing…" : "Remove"}
                  </Button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            {photoStatus.error && (
              <p className="text-sm text-destructive">{photoStatus.error}</p>
            )}

            {/* Name */}
            <div className="w-full">
              {isEditingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName();
                  }}
                  className="mx-auto w-full max-w-xs space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setIsEditingName(false);
                        }
                      }}
                      maxLength={MAX_GROUP_NAME}
                      autoFocus
                      aria-label="Group name"
                      className="text-base md:text-sm"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="shrink-0"
                      disabled={nameStatus.loading}
                      aria-label="Save group name"
                    >
                      {nameStatus.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={nameStatus.loading}
                      onClick={() => setIsEditingName(false)}
                      aria-label="Cancel renaming"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-destructive">{nameStatus.error}</span>
                    <span className="text-muted-foreground">
                      {nameDraft.length}/{MAX_GROUP_NAME}
                    </span>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <h2 className="min-w-0 wrap-break-word text-xl font-bold">
                    {info.name}
                  </h2>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={startEditingName}
                      aria-label="Rename group"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              <p className="mt-1 text-sm text-muted-foreground">
                Group · {memberCount} {memberCount === 1 ? "member" : "members"}
              </p>
            </div>
          </section>

          {/* Members */}
          <section className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Members</p>
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  onClick={() => setIsAddOpen(true)}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Add member
                </Button>
              )}
            </div>

            {members.length > 6 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members…"
                  aria-label="Search members"
                  className="pl-9 text-base md:text-sm"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <ul className="space-y-1">
                {visibleMembers.map((member) => {
                  const isMe = member.id === currentUserId;
                  // Admins can promote/remove regular members, and dismiss
                  // other admins. Never themselves.
                  const canManage = isAdmin && !member.isAdmin && !isMe;
                  const canDemote = isAdmin && member.isAdmin && !isMe;

                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent"
                    >
                      <Avatar
                        src={member.avatarUrl}
                        name={member.name}
                        className="h-10 w-10 shrink-0 text-sm"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {member.name}
                          {isMe && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (you)
                            </span>
                          )}
                        </p>
                        {member.isAdmin ? (
                          <p className="flex items-center gap-1 text-xs text-amber-500">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            Admin
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Member
                          </p>
                        )}
                      </div>

                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => askPromoteMember(member)}
                            aria-label={`Make ${member.name} an admin`}
                            title="Make admin"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <Crown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => askRemoveMember(member)}
                            aria-label={`Remove ${member.name}`}
                            title="Remove from group"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {canDemote && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => askDemoteMember(member)}
                            aria-label={`Dismiss ${member.name} as admin`}
                            title="Dismiss as admin"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <ShieldOff className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}

                {visibleMembers.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">
                    No members match “{memberSearch}”.
                  </p>
                )}
              </ul>
            )}
          </section>

          {/* Leave group: every member, admin or not */}
          <section className="border-t border-border p-4">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full border border-input text-destructive hover:text-destructive"
              disabled={isLoading}
              onClick={askLeaveGroup}
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Leave group
            </Button>
          </section>
        </div>
      </div>

      {/* Add member */}
      <AddMemberPopup
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        roomId={room.id}
        existingMemberIds={members.map((member) => member.id)}
        onAdded={(newMembers) => {
          setMembers(newMembers);
          setIsAddOpen(false);
        }}
      />

      {/* Confirm dialog (remove member / promote / remove photo) */}
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />

      {/* Full-size group photo */}
      {showPhoto && info.avatarUrl && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowPhoto(false);
          }}
        >
          <div className="relative max-w-[90vw]">
            <button
              type="button"
              onClick={() => setShowPhoto(false)}
              aria-label="Close photo"
              className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-foreground shadow-lg transition hover:scale-105 hover:bg-muted active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-black/20 p-1 shadow-2xl shadow-black/40">
              <img
                src={info.avatarUrl}
                alt={`${info.name} group photo`}
                className="block max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* DiceBear avatar picker for the group photo */}
      {showPicker && (
        <Suspense fallback={null}>
          <AvatarPicker
            initialSeed={info.name || ""}
            onSave={uploadGroupAvatar}
            onClose={() => setShowPicker(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm dialog (bottom sheet on phones, centered card on desktop)   */
/* ------------------------------------------------------------------ */

function ConfirmDialog({ config, onClose }) {
  const [busy, setBusy] = useState(false);

  if (!config) return null;

  const run = async () => {
    setBusy(true);
    try {
      await config.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => !busy && onClose()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={config.title}
        className="relative z-10 w-full rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-sm sm:rounded-xl"
      >
        <p className="font-bold">{config.title}</p>
        {config.message && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {config.message}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={config.destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={run}
          >
            {busy ? "Working…" : config.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add member popup                                                    */
/* ------------------------------------------------------------------ */

function AddMemberPopup({
  open,
  onOpenChange,
  roomId,
  existingMemberIds,
  onAdded,
}) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load all users when the popup opens.
  useEffect(() => {
    if (!open) return;

    setSearch("");
    setError("");
    setAddingId(null);
    setIsLoading(true);

    listUsersRequest()
      .then(({ data }) => setUsers(data.users))
      .catch((err) => setError(apiMessage(err, "Couldn't load users.")))
      .finally(() => setIsLoading(false));
  }, [open]);

  if (!open) return null;

  // Only people who aren't already members and match the search.
  const available = users.filter(
    (user) =>
      !existingMemberIds.includes(user._id) &&
      user.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = async (userId) => {
    setAddingId(userId);
    setError("");

    try {
      const { data } = await addRoomMemberRequest(roomId, userId);
      onAdded(data.members);
    } catch (err) {
      setError(apiMessage(err, "Couldn't add that person."));
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add member"
        className="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-sm sm:rounded-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-bold">Add member</p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          className="mb-3 text-base md:text-sm"
          autoFocus
        />

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain sm:max-h-64">
          {available.map((user) => (
            <button
              key={user._id}
              type="button"
              onClick={() => handleAdd(user._id)}
              disabled={addingId !== null}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent disabled:opacity-50"
            >
              <Avatar
                src={user.avatarUrl}
                name={user.name}
                className="h-10 w-10 shrink-0 text-sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {addingId === user._id ? "Adding…" : user.name}
              </span>
              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {!isLoading && available.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              {search ? "No matches" : "Everyone is already in this group"}
            </p>
          )}
          {isLoading && (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
