// src/routes/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
