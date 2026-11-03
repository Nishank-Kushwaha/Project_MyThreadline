import React from "react";
import { ThemeProvider } from "@/app/providers/ThemeContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { SocketProvider } from "@/app/providers/SocketContext";
import { E2EEProvider } from "@/features/e2ee/context/E2EEContext";
import { CallProvider } from "@/features/videoCall/context/CallContext";

import { Toaster } from "@/components/ui/sonner";
import { NotificationManager } from "@/features/notifications/components/NotificationManager";
import { IncomingCallDialog } from "@/features/videoCall/components/IncomingCallDialog";
import { CallModal } from "@/features/videoCall/components/CallModal";

export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Toaster position="top-center" richColors closeButton={false} />
        <SocketProvider>
          <E2EEProvider>
            <CallProvider>
              <NotificationManager />
              <IncomingCallDialog />
              <CallModal />
              {children}
            </CallProvider>
          </E2EEProvider>
        </SocketProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
