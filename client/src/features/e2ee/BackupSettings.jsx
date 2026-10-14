import React, { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useE2EE } from "@/features/e2ee/E2EEContext";
import {
  changeBackupPassphrase,
  checkPassphrase,
  createBackup,
  generatePassphrase,
  getBackupStatus,
  restoreBackup,
} from "@/lib/e2ee/backup";

function PassphraseField({ id, label, value, onChange, show, disabled }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
      />
    </div>
  );
}

const STRENGTH_COLORS = [
  "bg-destructive",
  "bg-amber-500",
  "bg-primary",
  "bg-emerald-500",
];

export function BackupSettings({ className }) {
  const { user } = useAuth();
  const { status, keysChanged, historyVersion } = useE2EE();

  const [backup, setBackup] = useState({ phase: "loading" });
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [oldPassphrase, setOldPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setBackup(await getBackupStatus(user.id));
    } catch (err) {
      console.error("[e2ee] couldn't check the backup:", err.message);
      setBackup({ phase: "error" });
    }
  }, [user.id]);

  useEffect(() => {
    if (status === "ready") load();
  }, [status, load, historyVersion]);

  const resetForm = () => {
    setPassphrase("");
    setConfirm("");
    setOldPassphrase("");
    setUnderstood(false);
    setIsChanging(false);
    setShow(false);
  };

  const run = async (task, successMessage) => {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const result = await task();
      resetForm();
      await load();
      setNotice(successMessage(result));
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run(
      async () => {
        await createBackup({ userId: user.id, passphrase });
        keysChanged();
      },
      () => "Backup is on, and this device is saved in it.",
    );

  const handleRestore = () =>
    run(
      async () => {
        const result = await restoreBackup({ userId: user.id, passphrase });
        keysChanged();
        return result;
      },
      ({ restored }) =>
        restored > 0
          ? `Restored ${restored} older device key${restored === 1 ? "" : "s"}. Your older messages can be read here now.`
          : "This device is now part of your backup.",
    );

  const handleChange = () =>
    run(
      () =>
        changeBackupPassphrase({
          userId: user.id,
          oldPassphrase,
          newPassphrase: passphrase,
        }),
      () => "Your passphrase was changed.",
    );

  const generate = () => {
    const generated = generatePassphrase();
    setPassphrase(generated);
    setConfirm(generated);
    setShow(true);
  };

  const strength = checkPassphrase(passphrase);
  const matches = passphrase.length > 0 && passphrase === confirm;

  const strengthBar = passphrase.length > 0 && (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full bg-muted-foreground/20",
              strength.level > i && STRENGTH_COLORS[strength.level],
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{strength.label}</p>
    </div>
  );

  const showToggle = (
    <button
      type="button"
      onClick={() => setShow((value) => !value)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {show ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
      {show ? "Hide" : "Show"}
    </button>
  );

  const card = cn(
    "flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4",
    className,
  );

  if (status !== "ready") return null;

  if (backup.phase === "loading") {
    return (
      <div className={card}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your backup…
        </p>
      </div>
    );
  }

  if (backup.phase === "error") {
    return (
      <div className={card}>
        <p className="text-sm text-destructive">Couldn't check your backup.</p>
        <Button size="sm" variant="outline" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        {backup.phase === "on" ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        ) : (
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {backup.phase === "none" && "Back up your message history"}
            {backup.phase === "restore" && "Read your older messages here"}
            {backup.phase === "changed" && "Your backup changed"}
            {backup.phase === "on" && "Message backup is on"}
          </p>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {backup.phase === "none" &&
              "A new browser can't read messages sent before it was set up. A backup protected by a passphrase fixes that. Only you can open it."}
            {backup.phase === "restore" &&
              "Enter your backup passphrase to read messages sent before this device was set up."}
            {backup.phase === "changed" &&
              "The backup on the server isn't the one this browser trusted. Only continue if you know why."}
            {backup.phase === "on" &&
              `${backup.summary.devices} device key${backup.summary.devices === 1 ? "" : "s"} saved. Last updated ${new Date(backup.summary.updatedAt).toLocaleDateString()}.`}
          </p>
        </div>
      </div>

      {(backup.phase === "none" ||
        backup.phase === "restore" ||
        backup.phase === "changed" ||
        isChanging) && (
        <div className="flex flex-1 flex-col gap-3 border-t border-border pt-3">
          {isChanging && (
            <PassphraseField
              id="oldPassphrase"
              label="Current passphrase"
              value={oldPassphrase}
              onChange={setOldPassphrase}
              show={show}
              disabled={busy}
            />
          )}

          <PassphraseField
            id="backupPassphrase"
            label={isChanging ? "New passphrase" : "Passphrase"}
            value={passphrase}
            onChange={setPassphrase}
            show={show}
            disabled={busy}
          />

          {(backup.phase === "none" || isChanging) && (
            <>
              {strengthBar}

              <PassphraseField
                id="backupConfirm"
                label="Repeat the passphrase"
                value={confirm}
                onChange={setConfirm}
                show={show}
                disabled={busy}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={generate}
                  disabled={busy}
                >
                  Generate one for me
                </Button>

                {passphrase && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(passphrase)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                )}
              </div>
            </>
          )}

          <div>{showToggle}</div>

          {(backup.phase === "none" || isChanging) && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand that if I lose this passphrase, nobody, including
                Threadline, can recover my older messages.
              </span>
            </label>
          )}

          <div className="mt-auto flex gap-2 pt-1">
            {backup.phase === "none" && (
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={busy || !strength.ok || !matches || !understood}
              >
                {busy ? "Working…" : "Turn on backup"}
              </Button>
            )}

            {(backup.phase === "restore" || backup.phase === "changed") && (
              <Button
                size="sm"
                onClick={handleRestore}
                disabled={busy || !passphrase}
              >
                {busy ? "Working…" : "Restore"}
              </Button>
            )}

            {isChanging && (
              <>
                <Button
                  size="sm"
                  onClick={handleChange}
                  disabled={
                    busy ||
                    !oldPassphrase ||
                    !strength.ok ||
                    !matches ||
                    !understood
                  }
                >
                  {busy ? "Working…" : "Change passphrase"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {backup.phase === "on" && !isChanging && (
        <Button
          size="sm"
          variant="outline"
          className="mt-auto self-start"
          onClick={() => setIsChanging(true)}
        >
          Change passphrase
        </Button>
      )}

      {backup.phase === "on" && !backup.summary.thisDeviceIncluded && (
        <p className="text-xs text-destructive">
          This device's key isn't in the backup yet. Restore with your
          passphrase to add it.
        </p>
      )}

      {notice && <p className="text-xs text-primary">{notice}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
