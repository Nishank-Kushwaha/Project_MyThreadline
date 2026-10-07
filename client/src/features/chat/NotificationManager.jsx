import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import {
  useChatNotifications,
  useNotificationClicks,
} from "./useChatNotifications";
import { usePushSubscription } from "./usePushSubscription";

// Mounted once for the whole app, so notifications and the push subscription
// work on every page (Profile included), not only on the dashboard.
export function NotificationManager() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  usePushSubscription(user?.id);
  useChatNotifications({ socket, user });

  // On the dashboard, Dashboard itself opens the room. On any other page, go
  // to the dashboard; it opens the room from ?room=<id> when it mounts.
  useNotificationClicks((roomId) => {
    if (pathname !== "/") navigate(`/?room=${roomId}`);
  });

  return null;
}
