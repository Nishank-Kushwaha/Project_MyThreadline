import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useE2EE } from "@/features/e2ee/E2EEContext";
import { listMyDeviceKeysRequest, removeDeviceKeyRequest } from "@/api/keysApi";
import { fingerprintOf } from "@/lib/e2ee/deviceKey";

export function EncryptionStatus() {
  const { status, deviceId, fingerprint, error, retry } = useE2EE();
  const [others, setOthers] = useState([]);
  const [listError, setListError] = useState("");

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
    }
  }, [deviceId]);

  useEffect(() => {
    if (status === "ready") loadOthers();
  }, [status, loadOthers]);

  const remove = async (id) => {
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
    <div className="flex min-h-0 flex-col space-y-3 rounded-xl border border-border bg-muted/40 p-4">
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
          <Button size="sm" variant="outline" className="h-8" onClick={retry}>
            Retry
          </Button>
        )}
      </div>

      {status === "ready" && others.length > 0 && (
        <div className="flex min-h-0 flex-col border-t border-border pt-3">
          <p className="mb-2 shrink-0 text-xs font-medium text-muted-foreground">
            Your other devices
          </p>

          <div className="max-h-18.75 space-y-2 overflow-y-auto overscroll-contain pr-1 scrollbar-thin">
            {others.map((key) => (
              <div key={key.deviceId} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs">
                    {key.fingerprint}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Added {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove device"
                  title="Remove device"
                  onClick={() => remove(key.deviceId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <p className="mt-2 shrink-0 text-[11px] text-muted-foreground">
            A removed device registers itself again if it's still signed in.
          </p>
        </div>
      )}

      {listError && (
        <p className="shrink-0 text-xs text-destructive">{listError}</p>
      )}
    </div>
  );
}
