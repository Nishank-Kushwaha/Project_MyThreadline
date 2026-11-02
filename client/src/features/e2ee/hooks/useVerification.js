import { useEffect, useMemo, useState } from "react";
import {
  clearRoomEncryptionCache,
  clearUserKeysCache,
  getRoomEncryption,
} from "@/lib/e2ee/directory";
import {
  getVerificationStatus,
  subscribeVerification,
} from "@/lib/e2ee/verification";

// Everyone in a chat with their current device keys and verification state.
// -> { roster, myDevices, statuses: { [userId]: { name, devices, state, ... } } }
export function useRoomVerification({ room, currentUserId, socket }) {
  const [roster, setRoster] = useState(null);
  const [version, setVersion] = useState(0); // bump to re-check

  useEffect(() => {
    let cancelled = false;

    getRoomEncryption(room.id)
      .then((info) => {
        if (!cancelled) setRoster(info);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [room.id, version]);

  // Someone's keys changed, or someone joined or left.
  useEffect(() => {
    if (!socket) return;

    const handleKeysChanged = ({ roomId, userId }) => {
      if (roomId !== room.id) return;
      clearUserKeysCache(userId);
      clearRoomEncryptionCache(room.id);
      setVersion((n) => n + 1);
    };

    const handleRosterChanged = ({ roomId }) => {
      if (roomId !== room.id) return;
      clearRoomEncryptionCache(room.id);
      setVersion((n) => n + 1);
    };

    socket.on("keys:changed", handleKeysChanged);
    socket.on("room:member-added", handleRosterChanged);
    socket.on("room:member-removed", handleRosterChanged);

    return () => {
      socket.off("keys:changed", handleKeysChanged);
      socket.off("room:member-added", handleRosterChanged);
      socket.off("room:member-removed", handleRosterChanged);
    };
  }, [socket, room.id]);

  // Verified (or un-verified) here or in another tab.
  useEffect(() => subscribeVerification(() => setVersion((n) => n + 1)), []);

  const myDevices = useMemo(
    () => roster?.devices.filter((d) => d.userId === currentUserId) ?? [],
    [roster, currentUserId],
  );

  const statuses = useMemo(() => {
    const result = {};
    if (!roster) return result;

    for (const member of roster.members) {
      if (member.userId === currentUserId) continue;

      const devices = roster.devices.filter((d) => d.userId === member.userId);

      result[member.userId] = {
        userId: member.userId,
        name: member.name,
        devices,
        ...getVerificationStatus(currentUserId, member.userId, devices),
      };
    }

    return result;
    // `version` is listed because verification state lives in localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, currentUserId, version]);

  return { roster, myDevices, statuses };
}
