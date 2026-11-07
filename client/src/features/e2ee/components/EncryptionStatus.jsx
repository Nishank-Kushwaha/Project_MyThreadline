import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useE2EE } from "@/features/e2ee/context/E2EEContext";
import {
  listMyDeviceKeysRequest,
  removeDeviceKeyRequest,
} from "@/features/e2ee/api/keysApi";
import { fingerprintOf } from "@/features/e2ee/lib/deviceKey";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Subcomponent: Header displaying status and fingerprint of this device
function CurrentDeviceHeader({ status, fingerprint, error, onRetry }) {
  return (
    <div className="flex shrink-0 items-start gap-3">
      {status === "ready" ? (
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      ) : status === "error" ? (
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      ) : (
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          {status === "ready" && "This device is registered"}
          {status === "loading" && "Setting up encryption…"}
          {status === "error" && "Encryption setup failed"}
        </p>

        {status === "ready" && (
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
            {fingerprint}
          </p>
        )}

        {status === "error" && (
          <p className="mt-0.5 text-xs text-destructive">{error}</p>
        )}
      </div>

      {status === "error" && (
        <Button size="sm" variant="outline" className="h-8" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

// Subcomponent: Row for a single registered secondary device key
function OtherDeviceItem({ device, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="break-all font-mono text-xs">{device.fingerprint}</p>
        <p className="text-[11px] text-muted-foreground">
          Added {new Date(device.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove device"
        title="Remove device"
        onClick={() => onRemove(device.deviceId)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Subcomponent: List container for other registered devices
function OtherDevicesList({ devices, onRemove }) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        No other devices yet. Sign in on another device and it will show up here.
      </div>
    );
  }

  return (
    <>
      <div className="max-h-18.75 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 scrollbar-thin lg:max-h-none">
        {devices.map((device) => (
          <OtherDeviceItem
            key={device.deviceId}
            device={device}
            onRemove={onRemove}
          />
        ))}
      </div>

      <p className="mt-2 shrink-0 text-[11px] text-muted-foreground">
        A removed device registers itself again if it's still signed in.
      </p>
    </>
  );
}

export function EncryptionStatus({ className }) {
  // Context hooks
  const { status, deviceId, fingerprint, error, retry } = useE2EE();

  // State hooks
  const [others, setOthers] = useState([]);
  const [listError, setListError] = useState("");
  const [loadedOthers, setLoadedOthers] = useState(false);

  // Fetch registered keys for user's other devices
  const loadOthers = useCallback(async () => {
    try {
      const { data } = await listMyDeviceKeysRequest();
      const rows = await Promise.all(
        data.keys
          .filter((key) => key.deviceId !== deviceId)
          .map(async (key) => ({
            ...key,
            fingerprint: await fingerprintOf(key.publicKey),
          })),
      );
      setOthers(rows);
    } catch {
      setListError("Couldn't load your other devices.");
    } finally {
      setLoadedOthers(true);
    }
  }, [deviceId]);

  // Load other devices when E2EE is initialized and ready
  useEffect(() => {
    if (status === "ready") {
      loadOthers();
    }
  }, [status, loadOthers]);

  // Revoke device key action handler
  const handleRemoveDevice = async (id) => {
    setListError("");
    try {
      await removeDeviceKeyRequest(id);
      setOthers((prev) => prev.filter((key) => key.deviceId !== id));
    } catch (err) {
      setListError(
        err.response?.data?.message || "Couldn't remove that device.",
      );
    }
  };

  if (status === "idle" || status === "unsupported") {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {status === "unsupported"
          ? "This browser can't create encryption keys."
          : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4",
        className,
      )}
    >
      <CurrentDeviceHeader
        status={status}
        fingerprint={fingerprint}
        error={error}
        onRetry={retry}
      />

      {status === "ready" && loadedOthers && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-3">
          <p className="mb-2 shrink-0 text-xs font-medium text-muted-foreground">
            Your other devices
          </p>

          <OtherDevicesList devices={others} onRemove={handleRemoveDevice} />
        </div>
      )}

      {listError && (
        <p className="shrink-0 text-xs text-destructive">{listError}</p>
      )}
    </div>
  );
}
