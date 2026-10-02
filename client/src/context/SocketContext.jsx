import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAccessToken } from "@/api/axios";
import { connectSocket, disconnectSocket } from "@/sockets/socket";
import { SERVER_ORIGIN } from "@/lib/utils";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  // Depend on user?.id so profile edits (which replace the user object) don't retrigger this.
  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      setSocket(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setSocket(connectSocket(token, SERVER_ORIGIN));
  }, [user?.id]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
