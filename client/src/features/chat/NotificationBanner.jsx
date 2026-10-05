import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
} from "@/lib/notifications";

const DISMISS_KEY = "threadline:notification-banner-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function NotificationBanner() {
  const [permission, setPermission] = useState(getNotificationPermission);
  const [isDismissed, setIsDismissed] = useState(readDismissed);

  const enable = async () => {
    setPermission(await requestNotificationPermission());
  };

  const dismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage unavailable: the banner just comes back next visit
    }
  };

  // TEMP (Phase 1 testing only): remove once real notifications are wired up.
  const sendTest = () =>
    showNotification({
      title: "Threadline",
      body: "Notifications are working.",
      tag: "test",
      data: { roomId: null },
    });

  if (permission === "unsupported") return null;

  if (permission === "granted") {
    return (
      <div className="px-4 pb-3">
        <button
          onClick={sendTest}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Send test notification
        </button>
      </div>
    );
  }

  if (isDismissed) return null;

  return (
    <div className="px-4 pb-3">
      <div className="relative rounded-md border border-border bg-muted p-3 text-xs">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {permission === "denied" ? (
          <p className="pr-5 text-muted-foreground">
            Notifications are blocked for this site. Allow them in your
            browser's site settings to get alerts when this tab is in the
            background.
          </p>
        ) : (
          <>
            <p className="pr-5 text-muted-foreground">
              Get alerted about new messages when this tab is in the background.
            </p>
            <Button size="sm" className="mt-2 h-8 w-full" onClick={enable}>
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Enable notifications
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
