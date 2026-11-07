import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useSocket } from "@/app/providers/SocketContext";
import {
  useChatNotifications,
  useNotificationClicks,
} from "../hooks/useChatNotifications";
import { usePushSubscription } from "../hooks/usePushSubscription";

// Application-wide headless controller synchronizing push subscriptions and incoming message alerts
export function NotificationManager() {
  // Context and router hooks
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Push subscription and chat alert hooks
  usePushSubscription(user?.id);
  useChatNotifications({ socket, user });

  // Navigate to dashboard with room query param when notification is clicked outside dashboard
  useNotificationClicks((roomId) => {
    if (pathname !== "/") {
      navigate(`/?room=${roomId}`);
    }
  });

  return null;
}
