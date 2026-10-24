import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import OAuthCallback from "@/pages/OAuthCallback";

import { SocketProvider } from "@/context/SocketContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { E2EEProvider } from "@/features/e2ee/E2EEContext";
import { CallProvider } from "@/context/CallContext";
import { IncomingCallDialog } from "@/features/videoCall/IncomingCallDialog";
import { CallModal } from "@/features/videoCall/CallModal";

import { NotificationManager } from "@/features/chat/NotificationManager";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="top-center" richColors closeButton={false} />
          <SocketProvider>
            <E2EEProvider>
              <CallProvider>
                <NotificationManager />
                <IncomingCallDialog />
                <CallModal />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/oauth-callback" element={<OAuthCallback />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </CallProvider>
            </E2EEProvider>
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
