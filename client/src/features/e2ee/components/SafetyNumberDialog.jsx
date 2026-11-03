import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeSafetyNumber,
  formatSafetyNumber,
  parseSafetyNumber,
  safetyQrText,
} from "@/lib/e2ee/safety";
import { removeVerification, saveVerification } from "@/lib/e2ee/verification";
import { fingerprintOf } from "@/lib/e2ee/deviceKey";
import { toast } from "sonner";

const signatureOf = (devices) =>
  devices
    .map((device) => device.publicKey)
    .sort()
    .join(",");

function describeChange(contact) {
  const parts = [];

  if (contact.added?.length) {
    parts.push(
      contact.added.length === 1
        ? "A new device was added"
        : `${contact.added.length} new devices were added`,
    );
  }
  if (contact.replaced?.length) {
    parts.push(
      contact.replaced.length === 1
        ? "A device key was replaced"
        : `${contact.replaced.length} device keys were replaced`,
    );
  }

  return parts.join(". ");
}

// me: { id, devices }   contact: { userId, name, devices, state, ... }
export function SafetyNumberDialog({ open, onOpenChange, me, contact }) {
  const [digits, setDigits] = useState("");
  const [qr, setQr] = useState("");
  const [theirInput, setTheirInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [fingerprints, setFingerprints] = useState({});

  const mySignature = signatureOf(me.devices);
  const theirSignature = contact ? signatureOf(contact.devices) : "";
  const canCompute =
    Boolean(contact) && me.devices.length > 0 && contact.devices.length > 0;

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
    // The signatures stand in for the device lists, which change identity on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me.id, contact?.userId, mySignature, theirSignature, canCompute]);

  // Short fingerprints of each device, for the details section.
  useEffect(() => {
    if (!open || !contact) return;

    let cancelled = false;
    const all = [...me.devices, ...contact.devices];

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

  useEffect(() => {
    if (!open) return;

    const onKey = (event) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || !contact) return null;

  const typed = parseSafetyNumber(theirInput);
  const comparison =
    typed.length === 0
      ? null
      : typed.length < 60
        ? "typing"
        : typed === digits
          ? "match"
          : "mismatch";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSafetyNumber(digits));
      setCopied(true);
      toast.success("Security number copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy security number");
    }
  };

  const markVerified = () => {
    saveVerification(me.id, contact.userId, contact.devices);
    toast.success(`${contact.name || "Contact"} marked as verified`);
    onOpenChange(false);
  };

  const unverify = () => {
    removeVerification(me.id, contact.userId);
    toast.info(`Verification cleared for ${contact.name || "contact"}`);
    onOpenChange(false);
  };

  const groups = digits.match(/.{5}/g) ?? [];

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
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Verify {contact.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compare this number with the one on {contact.name}'s screen, in
              person or over a call. If they match, nobody has tampered with
              your connection.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {contact.state === "changed" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p>
                <span className="font-semibold">
                  {contact.name}'s security code changed.
                </span>{" "}
                {describeChange(contact)}. Compare the new number before you
                trust it again.
              </p>
            </div>
          )}

          {!canCompute ? (
            <p className="text-sm text-muted-foreground">
              {contact.devices.length === 0
                ? `${contact.name} hasn't set up encryption yet, so there's nothing to verify.`
                : "This device isn't set up for encryption yet."}
            </p>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                {/* White background on purpose: scanners need the contrast. */}
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
                  onClick={copy}
                  disabled={!digits}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy number"}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="theirNumber">
                  Or paste their number to compare
                </Label>
                <Input
                  id="theirNumber"
                  value={theirInput}
                  onChange={(e) => setTheirInput(e.target.value)}
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
                    <ShieldAlert className="h-3.5 w-3.5" /> These numbers do NOT
                    match. Don't mark this contact as verified.
                  </p>
                )}
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Devices included in this number
                </summary>

                <div className="mt-2 space-y-2">
                  {[
                    { label: "You", devices: me.devices },
                    { label: contact.name, devices: contact.devices },
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
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {contact.state === "verified" &&
              `Verified on ${new Date(contact.verifiedAt).toLocaleDateString()}`}
          </p>

          <div className="flex gap-2">
            {contact.state === "verified" ? (
              <Button variant="ghost" size="sm" onClick={unverify}>
                Remove verification
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={markVerified}
                disabled={!canCompute || !digits || comparison === "mismatch"}
              >
                Mark as verified
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
