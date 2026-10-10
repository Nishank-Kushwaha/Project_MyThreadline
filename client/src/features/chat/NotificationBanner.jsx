import React, { useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  getNotificationPermission,
  requestNotificationPermission,
  setBrowserNotificationsOn,
  isIOS,
  isStandalone,
} from "@/lib/notifications";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { useBrowserNotificationsOn } from "./useBrowserNotifications";

export function NotificationBanner() {
  const { user } = useAuth();
  const browserOn = useBrowserNotificationsOn();
  const [permission, setPermission] = useState(getNotificationPermission);
  const [busy, setBusy] = useState(false);

  const accountEnabled = user?.notificationSettings?.enabled ?? true;

  if (permission === "unsupported") {
    // iPhone/iPad Safari only offers notifications to apps installed to the
    // Home Screen, so explain how instead of showing nothing.
    if (isIOS() && !isStandalone()) {
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

    return null;
  }

  const isBlocked = permission === "denied";
  const isOn = permission === "granted" && browserOn;

  // The label never changes (the switch shows on/off). The hint explains scope,
  // or the special states.
  let hint = "This browser only";

  if (isBlocked) hint = "Blocked: allow it in browser settings";
  else if (isOn && !accountEnabled) hint = "Paused: off in your profile";

  const toggle = async () => {
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

        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label="Notifications in this browser"
          disabled={busy || isBlocked}
          onClick={toggle}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isOn ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
              isOn && "translate-x-4",
            )}
          />
        </button>
      </div>
    </div>
  );
}
