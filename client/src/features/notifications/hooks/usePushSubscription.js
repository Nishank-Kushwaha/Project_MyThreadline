import { useEffect } from "react";
import { getNotificationPermission } from "@/features/notifications/lib/notifications";
import { subscribeToPush } from "@/features/notifications/lib/push";

// Re-registers this browser's push subscription on every login/app start, as
// long as the user already allowed notifications.
export function usePushSubscription(userId) {
  useEffect(() => {
    if (!userId) return;
    if (getNotificationPermission() !== "granted") return;

    subscribeToPush();
  }, [userId]);
}
