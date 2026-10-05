import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { setAccessToken } from "@/api/axios";
import {
  registerRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
} from "@/api/authApi";
import { unsubscribeFromPush } from "@/lib/push";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true while we try to restore a session

  // On first mount, try to silently restore a session from the refresh cookie.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await refreshRequest();
        setAccessToken(data.accessToken);
        const meRes = await meRequest();
        setUser(meRes.data.user);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await registerRequest(payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const login = useCallback(async (payload) => {
    const { data } = await loginRequest(payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    // First: it needs the access token, which is cleared below. This is what
    // stops the next person on a shared browser from getting your pushes.
    await unsubscribeFromPush();
    await logoutRequest();
    setAccessToken(null);
    setUser(null);
  }, []);

  // Used after profile edits (name, avatar) and by the OAuth callback page
  // to drop the freshly-fetched user straight into state.
  const updateUser = useCallback((partialOrFullUser) => {
    setUser((prev) => ({ ...prev, ...partialOrFullUser }));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, register, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
