import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ensureDeviceKey,
  fingerprintOf,
  isE2EESupported,
} from "@/lib/e2ee/deviceKey";
import { clearIdentityCache } from "@/lib/e2ee/identity";
import { clearKeyDirectoryCache } from "@/lib/e2ee/directory";

const E2EEContext = createContext(null);

const IDLE = {
  status: "idle", // idle | loading | ready | error | unsupported
  deviceId: null,
  publicKey: null,
  fingerprint: null,
  error: "",
};

// Sets up this browser's device key whenever someone is logged in. The private
// key stays in IndexedDB; only status and the PUBLIC key are kept in state.
export function E2EEProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(IDLE);
  const [attempt, setAttempt] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setState(IDLE);
      return;
    }

    clearKeyDirectoryCache();
    clearIdentityCache();

    if (!isE2EESupported()) {
      setState({ ...IDLE, status: "unsupported" });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading", error: "" }));

    ensureDeviceKey(user.id)
      .then(async ({ deviceId, publicKey }) => {
        clearIdentityCache(); // reload the key record that setup just wrote
        const fingerprint = await fingerprintOf(publicKey);
        if (!cancelled) {
          setState({
            status: "ready",
            deviceId,
            publicKey,
            fingerprint,
            error: "",
          });
        }
      })
      .catch((err) => {
        console.error("[e2ee] couldn't set up the device key:", err.message);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: err.response?.data?.message || err.message,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Called after a restore: reload the key set and let chats re-read history.
  const keysChanged = useCallback(() => {
    clearIdentityCache();
    setHistoryVersion((n) => n + 1);
  }, []);

  return (
    <E2EEContext.Provider
      value={{ ...state, retry, historyVersion, keysChanged }}
    >
      {children}
    </E2EEContext.Provider>
  );
}

export function useE2EE() {
  const ctx = useContext(E2EEContext);
  if (!ctx) throw new Error("useE2EE must be used within an E2EEProvider");
  return ctx;
}
