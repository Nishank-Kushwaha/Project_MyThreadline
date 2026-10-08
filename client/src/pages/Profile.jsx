import React, { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  X,
  Sparkles,
  ArrowLeft,
  Bell,
  BellOff,
  Eye,
  EyeOff,
} from "lucide-react";
import { subscribeToPush } from "@/lib/push";
import ThemePicker from "@/components/ui/ThemePicker";

// Lazy-loaded so the full DiceBear collection stays out of your main bundle
const AvatarPicker = lazy(() => import("@/components/ui/AvatarPicker"));

// Tighter card padding on phones, roomier from tablet up
const HEADER = "p-4 sm:p-6 lg:p-5";
const CONTENT = "p-4 pt-0 sm:p-6 sm:pt-0 lg:p-5 lg:pt-0";

function PageTitle() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
      <p className="text-sm text-muted-foreground">
        Manage your photo, name, appearance and password.
      </p>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || "");
  const [nameStatus, setNameStatus] = useState({
    error: "",
    success: "",
    loading: false,
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [passwordStatus, setPasswordStatus] = useState({
    error: "",
    success: "",
    loading: false,
  });

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

  const handleNameSave = async (e) => {
    e.preventDefault();
    setNameStatus({ error: "", success: "", loading: true });

    try {
      const { data } = await updateProfileRequest({ name });
      updateUser(data.user);
      setNameStatus({ error: "", success: "Saved.", loading: false });
    } catch (err) {
      setNameStatus({
        error: err.response?.data?.message || "Couldn't save your name.",
        success: "",
        loading: false,
      });
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPasswordStatus({ error: "", success: "", loading: true });

    try {
      await changePasswordRequest(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setPasswordStatus({
        error: "",
        success: "Password updated.",
        loading: false,
      });
    } catch (err) {
      setPasswordStatus({
        error: err.response?.data?.message || "Couldn't update your password.",
        success: "",
        loading: false,
      });
    }
  };

  const uploadAvatarFile = async (file) => {
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setAvatarStatus({ error: "", loading: true, action: "upload" });

    try {
      const { data } = await uploadAvatarRequest(file);
      updateUser(data.user);
      setAvatarStatus({ error: "", loading: false, action: null });
    } catch (err) {
      setAvatarStatus({
        error: err.response?.data?.message || "Couldn't upload that image.",
        loading: false,
        action: null,
      });
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
    } catch (err) {
      setAvatarStatus({
        error: err.response?.data?.message || "Couldn't remove your photo.",
        loading: false,
        action: null,
      });
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
    } catch (err) {
      updateUser({ notificationSettings: previous }); // put it back
      setNotificationStatus({
        error:
          err.response?.data?.message || "Couldn't save notification settings.",
        loading: false,
      });
    }
  };

  const currentAvatar = avatarPreview || user?.avatarUrl;
  const isUploading = avatarStatus.loading && avatarStatus.action === "upload";
  const isRemoving = avatarStatus.loading && avatarStatus.action === "remove";

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6 lg:h-dvh lg:min-h-176 lg:px-8 lg:py-6">
      {/* Page header */}
      <header className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        <PageTitle />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 w-fit sm:ml-0"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      </header>

      {/* Phone: 1 column · Tablet: photo on top, cards 2-up · Laptop: photo sidebar + content */}
      <div className="grid items-start gap-4 sm:gap-6 lg:h-full lg:grid-cols-12 lg:grid-rows-1">
        {/* Sidebar: on laptop the title and photo card sit together on the left */}
        <aside className="space-y-4 sm:space-y-6 lg:col-span-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-4 lg:space-y-0 xl:col-span-3">
          <div className="hidden space-y-1 lg:block">
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
            <PageTitle />
          </div>

          {/* Photo / identity */}
          <Card className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <CardHeader className={cn(HEADER, "lg:hidden")}>
              <CardTitle>Photo</CardTitle>
              <CardDescription>Shown next to your messages.</CardDescription>
            </CardHeader>

            <CardContent
              className={cn(
                CONTENT,
                "flex flex-col items-center gap-5 text-center",
                "sm:flex-row sm:items-center sm:gap-6 sm:text-left",
                "lg:flex-1 lg:flex-col lg:justify-center lg:gap-5 lg:p-5 lg:text-center",
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
                  className="h-24 w-24 text-3xl sm:h-28 sm:w-28 lg:h-36 lg:w-36 lg:text-5xl xl:h-44 xl:w-44 xl:text-6xl"
                />
              </button>

              <div className="w-full min-w-0 space-y-4 sm:flex-1 lg:flex-none lg:space-y-5">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {user?.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user?.email}
                  </p>
                </div>

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
                      notificationStatus.loading ||
                      !notificationSettings.enabled
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
        </aside>

        {/* Settings column */}
        <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-8 lg:h-full lg:min-h-0 xl:col-span-9">
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:shrink-0">
            {/* Name and Email */}
            <Card id="profile-info" className="scroll-mt-6">
              <CardHeader className={HEADER}>
                <CardTitle>Profile information</CardTitle>
                <CardDescription>
                  Update your name. Your email address cannot be changed.
                </CardDescription>
              </CardHeader>

              <CardContent className={CONTENT}>
                <form onSubmit={handleNameSave} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={2}
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user?.email || ""}
                      readOnly
                      className="cursor-not-allowed bg-muted"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="w-full sm:w-auto"
                      disabled={nameStatus.loading}
                    >
                      {nameStatus.loading ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </form>

                {nameStatus.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {nameStatus.error}
                  </p>
                )}
                {nameStatus.success && (
                  <p role="status" className="mt-2 text-sm text-primary">
                    {nameStatus.success}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Password */}
            <Card id="password" className="scroll-mt-6">
              <CardHeader className={HEADER}>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Signed up with Google and never set a password? Leave "current
                  password" blank.
                </CardDescription>
              </CardHeader>

              <CardContent className={CONTENT}>
                <form onSubmit={handlePasswordSave} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((f) => ({
                          ...f,
                          currentPassword: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((f) => ({
                          ...f,
                          newPassword: e.target.value,
                        }))
                      }
                      required
                      minLength={6}
                    />
                  </div>

                  {passwordStatus.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {passwordStatus.error}
                    </p>
                  )}
                  {passwordStatus.success && (
                    <p role="status" className="text-sm text-primary">
                      {passwordStatus.success}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="w-full sm:w-auto"
                      disabled={passwordStatus.loading}
                    >
                      {passwordStatus.loading ? "Updating…" : "Update password"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
          {/* Appearance: card fills the leftover height; only its theme list scrolls */}
          <Card
            id="appearance"
            className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
          >
            <CardHeader className={HEADER}>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Choose how the app looks. Saved to your account.
              </CardDescription>
            </CardHeader>
            <CardContent
              className={cn(
                CONTENT,
                "max-h-88 overflow-y-auto pt-1 sm:max-h-104 sm:pt-1 lg:max-h-none lg:min-h-0 lg:flex-1 lg:overscroll-contain lg:pt-1 scrollbar-thin",
              )}
            >
              <ThemePicker />
            </CardContent>
          </Card>
        </div>
      </div>

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
    </div>
  );
}
