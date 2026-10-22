import React, { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  updateProfileRequest,
  changePasswordRequest,
  uploadAvatarRequest,
  removeAvatarRequest,
  updateNotificationSettingsRequest,
} from "@/api/usersApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { cn, resolveAvatarUrl } from "@/lib/utils";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  ArrowLeft,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  ShieldCheck,
  CloudBackup,
  User,
  Palette,
  KeyRound,
  Lock,
  Check,
} from "lucide-react";
import ThemePicker from "@/components/ui/ThemePicker";
import { EncryptionStatus } from "@/features/e2ee/EncryptionStatus";
import { BackupSettings } from "@/features/e2ee/BackupSettings";

// Lazy-loaded so the full DiceBear collection stays out of your main bundle
const AvatarPicker = lazy(() => import("@/components/ui/AvatarPicker"));

/* ------------------------------------------------------------------ */
/* Shared style helpers                                                */
/* ------------------------------------------------------------------ */

// Tighter card padding on phones, roomier from tablet up
const HEADER = "p-4 sm:p-6 lg:p-5";
const CONTENT = "p-4 pt-0 sm:p-6 sm:pt-0 lg:p-5 lg:pt-0";

// Laptop-only: card body fills the card and scrolls only if it must
const SCROLL_LG =
  "lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain scrollbar-thin";

// Scroll INSIDE a card body.
// Phone/tablet: capped height. Laptop: fills the card, which fills the screen.
const SCROLL =
  "max-h-[26rem] overflow-y-auto pt-1 sm:max-h-[30rem] sm:pt-1 lg:max-h-none lg:min-h-0 lg:flex-1 lg:overscroll-contain lg:pt-1 scrollbar-thin";

/* ------------------------------------------------------------------ */
/* Left sidebar: photo, name, photo actions, notification switches     */
/* ------------------------------------------------------------------ */

function ProfileSidebar() {
  const { user, updateUser } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarStatus, setAvatarStatus] = useState({
    error: "",
    loading: false,
    action: null,
  });
  const [notificationStatus, setNotificationStatus] = useState({
    error: "",
    loading: false,
  });
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const uploadAvatarFile = async (file) => {
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setAvatarStatus({ error: "", loading: true, action: "upload" });

    try {
      const { data } = await uploadAvatarRequest(file);
      updateUser(data.user);
      setAvatarStatus({ error: "", loading: false, action: null });
      toast.success("Profile photo updated");
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't upload that image.";
      setAvatarStatus({
        error: errorMsg,
        loading: false,
        action: null,
      });
      toast.error(errorMsg);
    } finally {
      setAvatarPreview(null);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAvatarFile(file);
  };

  const handleAvatarRemove = async () => {
    if (
      !window.confirm(
        "Remove your photo? Other people will see your initial instead.",
      )
    )
      return;

    setAvatarStatus({ error: "", loading: true, action: "remove" });

    try {
      const { data } = await removeAvatarRequest();
      updateUser(data.user);
      setShowAvatarDialog(false);
      setAvatarStatus({ error: "", loading: false, action: null });
      toast.success("Profile photo removed");
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't remove your photo.";
      setAvatarStatus({
        error: errorMsg,
        loading: false,
        action: null,
      });
      toast.error(errorMsg);
    }
  };

  const notificationSettings = {
    enabled: user?.notificationSettings?.enabled ?? true,
    showPreview: user?.notificationSettings?.showPreview ?? true,
  };

  const handleNotificationToggle = async (key) => {
    const previous = notificationSettings;
    const next = { ...previous, [key]: !previous[key] };

    setNotificationStatus({ error: "", loading: true });
    updateUser({ notificationSettings: next }); // instant feedback

    try {
      const { data } = await updateNotificationSettingsRequest(next);
      updateUser(data.user);
      setNotificationStatus({ error: "", loading: false });
      toast.success("Notification preferences saved");
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't save notification settings.";
      updateUser({ notificationSettings: previous }); // put it back
      setNotificationStatus({
        error: errorMsg,
        loading: false,
      });
      toast.error(errorMsg);
    }
  };

  const currentAvatar = avatarPreview || user?.avatarUrl;
  const isUploading = avatarStatus.loading && avatarStatus.action === "upload";
  const isRemoving = avatarStatus.loading && avatarStatus.action === "remove";

  return (
    <>
      <Card className="lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <CardHeader className={cn(HEADER, "lg:hidden")}>
          <CardTitle>Photo</CardTitle>
          <CardDescription>Shown next to your messages.</CardDescription>
        </CardHeader>

        <CardContent
          className={cn(
            CONTENT,
            "flex flex-col items-center gap-5 text-center",
            "sm:flex-row sm:items-center sm:gap-6 sm:text-left",
            "lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-center lg:gap-4 lg:overflow-y-auto lg:p-5 lg:text-center",
          )}
        >
          <button
            type="button"
            disabled={!user?.avatarUrl}
            onClick={() => setShowAvatarDialog(true)}
            className={cn(
              "shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              user?.avatarUrl &&
                "cursor-pointer transition-transform hover:scale-105 active:scale-95",
            )}
            aria-label={
              user?.avatarUrl ? "View profile photo" : "No profile photo"
            }
          >
            <Avatar
              src={currentAvatar}
              name={user?.name}
              alt="Your avatar"
              className="h-24 w-24 text-3xl sm:h-28 sm:w-28 lg:h-32 lg:w-32 lg:text-5xl xl:h-40 xl:w-40 xl:text-6xl"
            />
          </button>

          <div className="w-full min-w-0 space-y-4 sm:flex-1 lg:flex-none">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{user?.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>

            {/* Photo actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto lg:w-full"
                disabled={avatarStatus.loading}
                onClick={() => setShowAvatarPicker(true)}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Avatar picker
              </Button>

              {/* sr-only (not hidden) keeps the file input keyboard-focusable */}
              <input
                id="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="peer sr-only"
                disabled={avatarStatus.loading}
                onChange={handleAvatarChange}
              />
              <Label
                htmlFor="avatar"
                className={cn(
                  "block w-full cursor-pointer rounded-md sm:w-auto lg:w-full",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                  avatarStatus.loading && "pointer-events-none opacity-60",
                )}
              >
                <span className="flex h-10 w-full items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">
                  {isUploading ? "Uploading…" : "Change photo"}
                </span>
              </Label>

              {user?.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full border border-input text-destructive hover:text-destructive sm:w-auto lg:w-full"
                  disabled={avatarStatus.loading}
                  onClick={handleAvatarRemove}
                >
                  {isRemoving ? "Removing…" : "Remove photo"}
                </Button>
              )}
            </div>

            {avatarStatus.error && (
              <p role="alert" className="text-sm text-destructive">
                {avatarStatus.error}
              </p>
            )}

            {/* Notification switches (saved to your account) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
              <Button
                type="button"
                variant="outline"
                aria-pressed={notificationSettings.enabled}
                className="w-full justify-between sm:w-auto lg:w-full"
                disabled={notificationStatus.loading}
                onClick={() => handleNotificationToggle("enabled")}
              >
                <span className="flex items-center">
                  {notificationSettings.enabled ? (
                    <Bell className="mr-1.5 h-4 w-4" />
                  ) : (
                    <BellOff className="mr-1.5 h-4 w-4" />
                  )}
                  Notifications (all devices)
                </span>
                <span
                  className={cn(
                    "ml-3 text-xs font-semibold",
                    notificationSettings.enabled
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {notificationSettings.enabled ? "On" : "Off"}
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                aria-pressed={notificationSettings.showPreview}
                className="w-full justify-between sm:w-auto lg:w-full"
                disabled={
                  notificationStatus.loading || !notificationSettings.enabled
                }
                onClick={() => handleNotificationToggle("showPreview")}
              >
                <span className="flex items-center">
                  {notificationSettings.showPreview ? (
                    <Eye className="mr-1.5 h-4 w-4" />
                  ) : (
                    <EyeOff className="mr-1.5 h-4 w-4" />
                  )}
                  Show message text
                </span>
                <span
                  className={cn(
                    "ml-3 text-xs font-semibold",
                    notificationSettings.showPreview
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {notificationSettings.showPreview ? "On" : "Off"}
                </span>
              </Button>
            </div>

            {notificationStatus.error && (
              <p role="alert" className="text-sm text-destructive">
                {notificationStatus.error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile photo viewer */}
      {showAvatarDialog && user?.avatarUrl && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAvatarDialog(false);
          }}
        >
          <div className="relative max-w-[92vw]">
            <button
              type="button"
              onClick={() => setShowAvatarDialog(false)}
              className="absolute -right-2 -top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background text-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-muted active:scale-95 sm:-right-3 sm:-top-3"
              aria-label="Close photo"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="overflow-hidden rounded-2xl border border-white/20 bg-black/20 p-1 shadow-2xl shadow-black/40">
              <img
                src={resolveAvatarUrl(user.avatarUrl)}
                alt={`${user?.name || "User"} profile`}
                referrerPolicy="no-referrer"
                className="block max-h-[80vh] max-w-[92vw] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Avatar picker */}
      {showAvatarPicker && (
        <Suspense fallback={null}>
          <AvatarPicker
            initialSeed={user?.name || ""}
            onSave={uploadAvatarFile}
            onClose={() => setShowAvatarPicker(false)}
          />
        </Suspense>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Cards (each owns its own state so tabs stay independent)            */
/* ------------------------------------------------------------------ */
function ProfileInfoCard() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [status, setStatus] = useState({
    error: "",
    success: "",
    loading: false,
  });

  const trimmed = name.trim();
  const dirty = trimmed !== (user?.name || "");
  const canSave = dirty && trimmed.length >= 2 && !status.loading;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setStatus({ error: "", success: "", loading: true });

    try {
      const { data } = await updateProfileRequest({ name: trimmed });
      updateUser(data.user);
      setName(trimmed);
      setStatus({ error: "", success: "Saved.", loading: false });
      toast.success("Name updated successfully");
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't save your name.";
      setStatus({
        error: errorMsg,
        success: "",
        loading: false,
      });
      toast.error(errorMsg);
    }
  };

  return (
    <Card className="flex flex-col lg:h-full">
      <CardHeader className={cn(HEADER, "border-b border-border")}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Profile information</CardTitle>
            <CardDescription className="mt-1">
              Update your name. Your email address cannot be changed.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent
        className={cn(CONTENT, SCROLL_LG, "flex flex-col pt-4 sm:pt-5 lg:pt-5")}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-5 lg:flex-1">
          {/* Fields sit centered between header and footer on laptop */}
          <div className="space-y-5 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:gap-6 lg:space-y-0">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (status.success) setStatus((s) => ({ ...s, success: "" }));
                }}
                required
                minLength={2}
                autoComplete="name"
                className="h-11 lg:h-12"
              />
              <p className="text-xs text-muted-foreground">
                Shown next to your messages.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  className="h-11 cursor-not-allowed bg-muted pr-10 lg:h-12"
                />
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                You sign in with this address, so it can't be changed.
              </p>
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 xl:flex-row xl:items-center xl:justify-between">
            <p
              role={status.error ? "alert" : "status"}
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm",
                status.error
                  ? "text-destructive"
                  : status.success
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {status.error ? (
                status.error
              ) : status.success ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  {status.success}
                </>
              ) : dirty ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  You have unsaved changes.
                </>
              ) : (
                "No changes yet."
              )}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:flex-1 xl:w-auto"
                  disabled={status.loading}
                  onClick={() => setName(user?.name || "")}
                >
                  Discard
                </Button>
              )}
              <Button
                type="submit"
                className="w-full sm:flex-1 xl:w-auto xl:min-w-36"
                disabled={!canSave}
              >
                {status.loading ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [show, setShow] = useState({ current: false, next: false });
  const [status, setStatus] = useState({
    error: "",
    success: "",
    loading: false,
  });

  const len = form.newPassword.length;
  const rules = [
    { ok: len >= 6, text: "At least 6 characters" },
    { ok: len >= 12, text: "12 or more characters is even stronger" },
  ];
  const canSave = len >= 6 && !status.loading;

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (status.success) setStatus((s) => ({ ...s, success: "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setStatus({ error: "", success: "", loading: true });

    try {
      await changePasswordRequest(form);
      setForm({ currentPassword: "", newPassword: "" });
      setShow({ current: false, next: false });
      setStatus({ error: "", success: "Password updated.", loading: false });
      toast.success("Password updated successfully");
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || "Couldn't update your password.";
      setStatus({
        error: errorMsg,
        success: "",
        loading: false,
      });
      toast.error(errorMsg);
    }
  };

  // Password input with a show/hide button
  const passwordField = ({
    id,
    label,
    value,
    onChange,
    shown,
    toggle,
    ...rest
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={onChange}
          className="h-11 pr-11 lg:h-12"
          {...rest}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={
            shown
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col lg:h-full">
      <CardHeader className={cn(HEADER, "border-b border-border")}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Password</CardTitle>
            <CardDescription className="mt-1">
              Signed up with Google and never set a password? Leave "current
              password" blank.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent
        className={cn(CONTENT, SCROLL_LG, "flex flex-col pt-4 sm:pt-5 lg:pt-5")}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-5 lg:flex-1">
          <div className="space-y-5 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:gap-6 lg:space-y-0">
            {passwordField({
              id: "currentPassword",
              label: "Current password",
              value: form.currentPassword,
              onChange: update("currentPassword"),
              shown: show.current,
              toggle: () => setShow((s) => ({ ...s, current: !s.current })),
              autoComplete: "current-password",
            })}

            <div className="space-y-3">
              {passwordField({
                id: "newPassword",
                label: "New password",
                value: form.newPassword,
                onChange: update("newPassword"),
                shown: show.next,
                toggle: () => setShow((s) => ({ ...s, next: !s.next })),
                autoComplete: "new-password",
                required: true,
                minLength: 6,
              })}

              {/* Live checklist */}
              <ul className="space-y-1.5">
                {rules.map((rule) => (
                  <li
                    key={rule.text}
                    className={cn(
                      "flex items-center gap-2 text-xs transition-colors",
                      rule.ok ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        rule.ok
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {rule.ok && <Check className="h-3 w-3" />}
                    </span>
                    {rule.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 xl:flex-row xl:items-center xl:justify-between">
            <p
              role={status.error ? "alert" : "status"}
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm",
                status.error
                  ? "text-destructive"
                  : status.success
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {status.error ? (
                status.error
              ) : status.success ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  {status.success}
                </>
              ) : (
                "Use a password you don't use anywhere else."
              )}
            </p>

            <Button
              type="submit"
              className="w-full xl:w-auto xl:min-w-36"
              disabled={!canSave}
            >
              {status.loading ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Tab panels                                                          */
/* ------------------------------------------------------------------ */

function PersonalTab() {
  return (
    <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:h-full lg:grid-rows-[minmax(0,1fr)]">
      <ProfileInfoCard />
      <PasswordCard />
    </div>
  );
}

function EncryptionTab() {
  return (
    <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:h-full lg:grid-rows-[minmax(0,1fr)]">
      <Card className="flex min-h-0 flex-col lg:h-full">
        <CardHeader className={HEADER}>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            End-to-end encryption
          </CardTitle>
          <CardDescription>
            Check this device's encryption status and manage your registered
            devices.
          </CardDescription>
        </CardHeader>
        <CardContent className={cn(CONTENT, SCROLL_LG, "flex flex-col")}>
          <EncryptionStatus className="flex-1" />
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col lg:h-full">
        <CardHeader className={HEADER}>
          <CardTitle className="flex items-center gap-2">
            <CloudBackup className="h-5 w-5 text-primary" />
            Backup
          </CardTitle>
          <CardDescription>Bring back your lost history.</CardDescription>
        </CardHeader>
        <CardContent className={cn(CONTENT, SCROLL_LG, "flex flex-col")}>
          <BackupSettings className="flex-1" />
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceTab() {
  return (
    <Card className="flex min-h-0 flex-col lg:h-full">
      <CardHeader className={HEADER}>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose how the app looks. Saved to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className={cn(CONTENT, SCROLL)}>
        <ThemePicker />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* TABS: to add a new tab, write a panel component and add ONE line.   */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "personal", label: "Personal", icon: User, Panel: PersonalTab },
  {
    id: "encryption",
    label: "Encryption",
    icon: ShieldCheck,
    Panel: EncryptionTab,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    Panel: AppearanceTab,
  },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab lives in the URL (?tab=encryption) so refresh / links keep it
  const requested = searchParams.get("tab");
  const active = TABS.some((t) => t.id === requested) ? requested : TABS[0].id;

  // A tab mounts on first visit, then stays mounted so typed text isn't lost
  const [mounted, setMounted] = useState({});
  useEffect(() => {
    setMounted((m) => (m[active] ? m : { ...m, [active]: true }));
  }, [active]);

  const selectTab = (id) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );

  const onTabKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === active);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n === null) return;
    e.preventDefault();
    selectTab(TABS[n].id);
    document.getElementById(`tab-${TABS[n].id}`)?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6 lg:h-dvh lg:min-h-176 lg:px-8 lg:py-6">
      {/*
        Phone/tablet: header → photo → tabs → content, stacked (order-*).
        Laptop: header | tabs on row 1, photo | content on row 2, no page scroll.
      */}
      <div className="grid gap-4 sm:gap-6 lg:h-full lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-4">
        {/* Back + title */}
        <header className="order-1 flex items-center gap-3 lg:order-0 lg:col-span-4 lg:col-start-1 lg:row-start-1 xl:col-span-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Profile
          </h1>
        </header>

        {/* Photo + quick settings */}
        <aside className="order-2 min-w-0 lg:order-0 lg:col-span-4 lg:col-start-1 lg:row-start-2 lg:min-h-0 xl:col-span-3">
          <ProfileSidebar />
        </aside>

        {/* Tab buttons */}
        <div
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={onTabKeyDown}
          className="order-3 flex gap-1 self-start overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-sm lg:order-0 lg:col-span-8 lg:col-start-5 lg:row-start-1 xl:col-span-9 xl:col-start-4"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = id === active;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${id}`}
                title={label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(id)}
                className={cn(
                  "flex h-10 min-w-fit flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold sm:px-4 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                {/* Phones: icon only (label stays for screen readers) */}
                <span className="sr-only sm:not-sr-only">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <main className="order-4 min-w-0 lg:order-0 lg:col-span-8 lg:col-start-5 lg:row-start-2 lg:min-h-0 xl:col-span-9 xl:col-start-4">
          {TABS.map(({ id, Panel }) => {
            const isActive = id === active;
            if (!mounted[id] && !isActive) return null;
            return (
              <div
                key={id}
                id={`panel-${id}`}
                role="tabpanel"
                aria-labelledby={`tab-${id}`}
                hidden={!isActive}
                className="lg:h-full lg:min-h-0"
              >
                <Panel />
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}
