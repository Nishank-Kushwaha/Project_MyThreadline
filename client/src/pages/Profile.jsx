import React, { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  updateProfileRequest,
  changePasswordRequest,
  uploadAvatarRequest,
  removeAvatarRequest,
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
import { cn } from "@/lib/utils";
import { X, Sparkles } from "lucide-react";
import ThemePicker from "@/components/ui/ThemePicker";

// Lazy-loaded so the full DiceBear collection stays out of your main bundle
const AvatarPicker = lazy(() => import("@/components/ui/AvatarPicker"));

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

  // Controls the larger profile-photo dialog
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const handleNameSave = async (e) => {
    e.preventDefault();
    setNameStatus({ error: "", success: "", loading: true });

    try {
      const { data } = await updateProfileRequest({ name });
      updateUser(data.user);

      setNameStatus({
        error: "",
        success: "Saved.",
        loading: false,
      });
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

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
      });

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
    setAvatarPreview(URL.createObjectURL(file));
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

    setAvatarStatus({
      error: "",
      loading: true,
      action: "remove",
    });

    try {
      const { data } = await removeAvatarRequest();

      updateUser(data.user);

      // Close the dialog if the photo was being viewed
      setShowAvatarDialog(false);

      setAvatarStatus({
        error: "",
        loading: false,
        action: null,
      });
    } catch (err) {
      setAvatarStatus({
        error: err.response?.data?.message || "Couldn't remove your photo.",
        loading: false,
        action: null,
      });
    }
  };

  const currentAvatar = avatarPreview || user?.avatarUrl;
  const isUploading = avatarStatus.loading && avatarStatus.action === "upload";
  const isRemoving = avatarStatus.loading && avatarStatus.action === "remove";

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <button
        onClick={() => navigate("/")}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>

      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Photo</CardTitle>
          <CardDescription>Shown next to your messages.</CardDescription>
        </CardHeader>

        <CardContent className="flex items-center gap-4">
          {/* Clickable Avatar */}
          <button
            type="button"
            disabled={!user?.avatarUrl}
            onClick={() => setShowAvatarDialog(true)}
            className={cn(
              "rounded-full",
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
              className="h-16 w-16 text-lg"
            />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                disabled={avatarStatus.loading}
                onClick={() => setShowAvatarPicker(true)}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Avatar picker
              </Button>

              <Label
                htmlFor="avatar"
                className={cn(
                  "cursor-pointer",
                  avatarStatus.loading && "pointer-events-none opacity-60",
                )}
              >
                <span className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent">
                  {isUploading ? "Uploading…" : "Change photo"}
                </span>
              </Label>

              <input
                id="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={avatarStatus.loading}
                onChange={handleAvatarChange}
              />

              {user?.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="border border-input text-destructive hover:text-destructive"
                  disabled={avatarStatus.loading}
                  onClick={handleAvatarRemove}
                >
                  {isRemoving ? "Removing…" : "Remove photo"}
                </Button>
              )}
            </div>

            {avatarStatus.error && (
              <p className="mt-2 text-sm text-destructive">
                {avatarStatus.error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile Photo Dialog */}
      {showAvatarDialog && user?.avatarUrl && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onMouseDown={(e) => {
            // Clicking outside the image closes the dialog
            if (e.target === e.currentTarget) {
              setShowAvatarDialog(false);
            }
          }}
        >
          <div className="relative max-w-[90vw]">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowAvatarDialog(false)}
              className={cn(
                "absolute -right-3 -top-3 z-20",
                "flex h-9 w-9 items-center justify-center",
                "rounded-full",
                "border border-border/60",
                "bg-background text-foreground",
                "shadow-lg",
                "transition-all duration-200",
                "hover:scale-105 hover:bg-muted",
                "active:scale-95",
              )}
              aria-label="Close photo"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Larger image */}
            <div
              className={cn(
                "overflow-hidden rounded-2xl",
                "border border-white/20",
                "bg-black/20",
                "p-1",
                "shadow-2xl shadow-black/40",
              )}
            >
              <img
                src={user.avatarUrl}
                alt={`${user?.name || "User"} profile`}
                className={cn(
                  "block max-h-[80vh] max-w-[90vw]",
                  "rounded-xl",
                  "object-contain",
                )}
              />
            </div>
          </div>
        </div>
      )}

      {/* Avatar Picker Dialog */}
      {showAvatarPicker && (
        <Suspense fallback={null}>
          <AvatarPicker
            initialSeed={user?.name || ""}
            onSave={uploadAvatarFile}
            onClose={() => setShowAvatarPicker(false)}
          />
        </Suspense>
      )}

      {/* Name and Email */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your name. Your email address cannot be changed.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleNameSave} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user?.email}
                readOnly
                className="cursor-not-allowed bg-muted"
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button type="submit" disabled={nameStatus.loading}>
                {nameStatus.loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>

          {nameStatus.error && (
            <p className="mt-2 text-sm text-destructive">{nameStatus.error}</p>
          )}

          {nameStatus.success && (
            <p className="mt-2 text-sm text-primary">{nameStatus.success}</p>
          )}
        </CardContent>
      </Card>

      {/* Theme Picker */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how the app looks. Saved to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Signed up with Google and never set a password? Leave "current
            password" blank.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handlePasswordSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
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
              <p className="text-sm text-destructive">{passwordStatus.error}</p>
            )}

            {passwordStatus.success && (
              <p className="text-sm text-primary">{passwordStatus.success}</p>
            )}

            <Button type="submit" disabled={passwordStatus.loading}>
              {passwordStatus.loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
