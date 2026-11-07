import React, { useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useBrowserNotificationsOn } from "../hooks/useBrowserNotifications";
import {
  getNotificationPermission,
  requestNotificationPermission,
  setBrowserNotificationsOn,
  isIOS,
  isStandalone,
} from "@/features/notifications/lib/notifications";
import {
  subscribeToPush,
  unsubscribeFromPush,
} from "@/features/notifications/lib/push";
import { cn } from "@/lib/utils";

// Subcomponent: iOS installation guide when push notifications require standalone PWA
function IOSInstallGuide() {
  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <Share className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight">
            Install to get notifications
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Tap Share, then Add to Home Screen
          </p>
        </div>
      </div>
    </div>
  );
}

// Subcomponent: Accessible toggle switch button
function ToggleSwitch({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function NotificationBanner() {
  // Context hooks
  const { user } = useAuth();
  const browserOn = useBrowserNotificationsOn();

  // State hooks
  const [permission, setPermission] = useState(getNotificationPermission);
  const [busy, setBusy] = useState(false);

  // Derived state
  const accountEnabled = user?.notificationSettings?.enabled ?? true;
  const isBlocked = permission === "denied";
  const isOn = permission === "granted" && browserOn;

  // Resolve explanatory status hint
  let hint = "This browser only";
  if (isBlocked) {
    hint = "Blocked: allow it in browser settings";
  } else if (isOn && !accountEnabled) {
    hint = "Paused: off in your profile";
  }

  // Action handlers
  const handleToggle = async () => {
    setBusy(true);

    try {
      if (isOn) {
        setBrowserNotificationsOn(false);
        await unsubscribeFromPush();
        return;
      }

      let current = permission;
      if (current === "default") {
        current = await requestNotificationPermission();
        setPermission(current);
      }

      if (current !== "granted") return;

      setBrowserNotificationsOn(true);
      subscribeToPush();
    } finally {
      setBusy(false);
    }
  };

  // Safari on iOS requires adding to Home Screen before enabling notifications
  if (permission === "unsupported") {
    if (isIOS() && !isStandalone()) {
      return <IOSInstallGuide />;
    }
    return null;
  }

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {isOn ? (
            <Bell className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          <div className="min-w-0">
            <p className="truncate text-xs font-medium leading-tight">
              Browser notifications
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {hint}
            </p>
          </div>
        </div>

        <ToggleSwitch
          checked={isOn}
          disabled={busy || isBlocked}
          onChange={handleToggle}
          label="Notifications in this browser"
        />
      </div>
    </div>
  );
}
