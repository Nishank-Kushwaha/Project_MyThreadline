import { useEffect, useState } from "react";
import {
  BROWSER_NOTIFICATIONS_EVENT,
  isBrowserNotificationsOn,
} from "@/lib/notifications";

// Re-renders when this browser's switch changes, here or in another tab.
export function useBrowserNotificationsOn() {
  const [isOn, setIsOn] = useState(isBrowserNotificationsOn);

  useEffect(() => {
    const sync = () => setIsOn(isBrowserNotificationsOn());

    window.addEventListener(BROWSER_NOTIFICATIONS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BROWSER_NOTIFICATIONS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return isOn;
}
