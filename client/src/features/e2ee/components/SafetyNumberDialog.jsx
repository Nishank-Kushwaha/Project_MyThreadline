import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeSafetyNumber,
  formatSafetyNumber,
  parseSafetyNumber,
  safetyQrText,
} from "@/features/e2ee/lib/safety";
import {
  removeVerification,
  saveVerification,
} from "@/features/e2ee/lib/verification";
import { fingerprintOf } from "@/features/e2ee/lib/deviceKey";

// Stable device public key signature for effect dependency tracking
const signatureOf = (devices = []) =>
  devices
    .map((device) => device.publicKey)
    .sort()
    .join(",");

// Formats added and replaced device keys description
function describeChange(contact) {
  const parts = [];

  if (contact?.added?.length) {
    parts.push(
      contact.added.length === 1
        ? "A new device was added"
        : `${contact.added.length} new devices were added`,
    );
  }
  if (contact?.replaced?.length) {
    parts.push(
      contact.replaced.length === 1
        ? "A device key was replaced"
        : `${contact.replaced.length} device keys were replaced`,
    );
  }

  return parts.join(". ");
}

// Subcomponent: Dialog header with title, explanation, and close button
function SafetyNumberDialogHeader({ contactName, onClose }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-base font-semibold">Verify {contactName}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Compare this number with the one on {contactName}'s screen, in person
          or over a call. If they match, nobody has tampered with your
          connection.
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Subcomponent: Warning banner displayed when verified keys have changed
function KeyChangeAlert({ contact }) {
  const changeDescription = describeChange(contact);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p>
        <span className="font-semibold">
          {contact.name}'s security code changed.
        </span>{" "}
        {changeDescription ? `${changeDescription}. ` : ""}Compare the new
        number before you trust it again.
      </p>
    </div>
  );
}

// Subcomponent: QR code and 60-digit safety number grid
function SafetyNumberDisplay({ qr, digits, copied, onCopy }) {
  const groups = digits.match(/.{5}/g) ?? [];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* White background provided for reliable QR optical scanner contrast */}
      <div className="rounded-xl bg-white p-2 shadow-sm">
        {qr ? (
          <img
            src={qr}
            alt="QR code of the safety number"
            className="h-44 w-44"
          />
        ) : (
          <div className="h-44 w-44 animate-pulse rounded-lg bg-muted" />
        )}
      </div>

      <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 font-mono text-sm tracking-wider">
        {groups.map((group, index) => (
          <span key={index}>{group}</span>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCopy}
        disabled={!digits}
      >
        {copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        <span>{copied ? "Copied" : "Copy number"}</span>
      </Button>
    </div>
  );
}

// Subcomponent: Manual safety number comparison input and match indicator
function NumberComparisonInput({ value, onChange, comparison }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="theirNumber">Or paste their number to compare</Label>
      <Input
        id="theirNumber"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the number or QR text they sent"
        autoComplete="off"
        spellCheck={false}
      />

      {comparison === "match" && (
        <p className="flex items-center gap-1 text-xs text-emerald-500">
          <ShieldCheck className="h-3.5 w-3.5" /> The numbers match.
        </p>
      )}
      {comparison === "mismatch" && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <ShieldAlert className="h-3.5 w-3.5" /> These numbers do NOT match.
          Don't mark this contact as verified.
        </p>
      )}
    </div>
  );
}

// Subcomponent: Expandable details showing device fingerprints included in calculation
function DeviceFingerprintsDetails({
  meDevices = [],
  contactName,
  contactDevices = [],
  fingerprints = {},
}) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        Devices included in this number
      </summary>

      <div className="mt-2 space-y-2">
        {[
          { label: "You", devices: meDevices },
          { label: contactName, devices: contactDevices },
        ].map(({ label, devices }) => (
          <div key={label}>
            <p className="font-medium text-foreground">
              {label} ({devices.length})
            </p>
            {devices.map((device) => (
              <p key={device.publicKey} className="font-mono">
                {fingerprints[device.publicKey] ?? "…"}
              </p>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

// Subcomponent: Footer with verification status timestamp and action button
function SafetyNumberDialogFooter({
  contactState,
  verifiedAt,
  canCompute,
  digits,
  isMismatch,
  onVerify,
  onUnverify,
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
      <p className="text-xs text-muted-foreground">
        {contactState === "verified" &&
          verifiedAt &&
          `Verified on ${new Date(verifiedAt).toLocaleDateString()}`}
      </p>

      <div className="flex gap-2">
        {contactState === "verified" ? (
          <Button variant="ghost" size="sm" onClick={onUnverify}>
            Remove verification
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onVerify}
            disabled={!canCompute || !digits || isMismatch}
          >
            Mark as verified
          </Button>
        )}
      </div>
    </div>
  );
}

export function SafetyNumberDialog({ open, onOpenChange, me, contact }) {
  // State hooks
  const [digits, setDigits] = useState("");
  const [qr, setQr] = useState("");
  const [theirInput, setTheirInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [fingerprints, setFingerprints] = useState({});

  // Derived signatures and validation
  const mySignature = signatureOf(me?.devices);
  const theirSignature = signatureOf(contact?.devices);
  const canCompute =
    Boolean(contact) &&
    (me?.devices?.length ?? 0) > 0 &&
    (contact?.devices?.length ?? 0) > 0;

  const typed = parseSafetyNumber(theirInput);
  const comparison =
    typed.length === 0
      ? null
      : typed.length < 60
        ? "typing"
        : typed === digits
          ? "match"
          : "mismatch";

  // Compute safety number and generate QR code
  useEffect(() => {
    if (!open || !contact || !canCompute) return;

    let cancelled = false;
    setDigits("");
    setQr("");
    setTheirInput("");
    setCopied(false);

    (async () => {
      const value = await computeSafetyNumber({
        myId: me.id,
        myDevices: me.devices,
        theirId: contact.userId,
        theirDevices: contact.devices,
      });
      if (cancelled) return;
      setDigits(value);

      try {
        const QRCode = await import("qrcode");
        const toDataURL = QRCode.toDataURL ?? QRCode.default.toDataURL;

        const url = await toDataURL(safetyQrText(value), {
          margin: 1,
          width: 240,
          errorCorrectionLevel: "M",
        });

        if (!cancelled) setQr(url);
      } catch (err) {
        console.error("[e2ee] couldn't draw the QR code:", err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.id, contact?.userId, mySignature, theirSignature, canCompute]);

  // Load individual device key fingerprints
  useEffect(() => {
    if (!open || !contact) return;

    let cancelled = false;
    const all = [...(me?.devices ?? []), ...(contact?.devices ?? [])];

    Promise.all(
      all.map(async (device) => [
        device.publicKey,
        await fingerprintOf(device.publicKey),
      ]),
    ).then((entries) => {
      if (!cancelled) setFingerprints(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mySignature, theirSignature]);

  // Close dialog on Escape key
  useEffect(() => {
    if (!open) return;

    const onKey = (event) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Action handlers
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatSafetyNumber(digits));
      setCopied(true);
      toast.success("Security number copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy security number");
    }
  };

  const handleMarkVerified = () => {
    saveVerification(me.id, contact.userId, contact.devices);
    toast.success(`${contact.name || "Contact"} marked as verified`);
    onOpenChange(false);
  };

  const handleUnverify = () => {
    removeVerification(me.id, contact.userId);
    toast.info(`Verification cleared for ${contact.name || "contact"}`);
    onOpenChange(false);
  };

  if (!open || !contact) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-label={`Verify ${contact.name}`}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <SafetyNumberDialogHeader
          contactName={contact.name}
          onClose={() => onOpenChange(false)}
        />

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {contact.state === "changed" && <KeyChangeAlert contact={contact} />}

          {!canCompute ? (
            <p className="text-sm text-muted-foreground">
              {contact.devices.length === 0
                ? `${contact.name} hasn't set up encryption yet, so there's nothing to verify.`
                : "This device isn't set up for encryption yet."}
            </p>
          ) : (
            <>
              <SafetyNumberDisplay
                qr={qr}
                digits={digits}
                copied={copied}
                onCopy={handleCopy}
              />

              <NumberComparisonInput
                value={theirInput}
                onChange={setTheirInput}
                comparison={comparison}
              />

              <DeviceFingerprintsDetails
                meDevices={me?.devices}
                contactName={contact.name}
                contactDevices={contact.devices}
                fingerprints={fingerprints}
              />
            </>
          )}
        </div>

        <SafetyNumberDialogFooter
          contactState={contact.state}
          verifiedAt={contact.verifiedAt}
          canCompute={canCompute}
          digits={digits}
          isMismatch={comparison === "mismatch"}
          onVerify={handleMarkVerified}
          onUnverify={handleUnverify}
        />
      </div>
    </div>,
    document.body,
  );
}
