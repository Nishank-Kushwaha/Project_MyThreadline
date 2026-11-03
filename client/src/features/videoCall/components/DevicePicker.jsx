import React, { useEffect, useRef, useState } from "react";
import {
  Settings2,
  Mic,
  Video,
  Volume2,
  Check,
  Loader2,
  SwitchCamera,
} from "lucide-react";
import { useCall } from "@/features/videoCall/context/CallContext";
import { cn } from "@/lib/utils";

const FRONT = /front/i;
const REAR = /back|rear|environment/i;

/** Phones name cameras things like "camera2 1, facing front": show a human label. */
function cameraName(device, index, all) {
  const label = device.label || "";
  if (FRONT.test(label)) return "Front camera";
  if (REAR.test(label)) {
    const rears = all.filter((d) => REAR.test(d.label || ""));
    return rears.length > 1
      ? `Rear camera ${rears.indexOf(device) + 1}`
      : "Rear camera";
  }
  return cleanLabel(label, `Camera ${index + 1}`);
}

// "Integrated Camera (04f2:b6ea)" -> "Integrated Camera"
function cleanLabel(label, fallback) {
  if (!label) return fallback;
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        <Icon className="h-3.5 w-3.5" />
        <span>{title}</span>
      </div>
      {hint && (
        <p className="px-3 pb-1 text-[11px] text-amber-300/90">{hint}</p>
      )}
      <div role="radiogroup" aria-label={title} className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function Option({ label, selected, busy, disabled, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
        selected ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5",
        disabled && !busy && "opacity-50",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : selected ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : null}
    </button>
  );
}

const Empty = ({ children }) => (
  <p className="px-3 py-2 text-sm text-zinc-500">{children}</p>
);

/**
 * Settings button + popup for choosing microphone, camera and speaker during a call.
 * Rendered inside <CallControls/> (which must be `relative`), the popup opens above it.
 */
export function DevicePicker() {
  const {
    callType,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    cameraFacing,
    canFlipCamera,
    supportsOutputSelection,
    refreshDevices,
    changeMicrophone,
    changeCamera,
    flipCamera,
    changeSpeaker,
  } = useCall();

  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // Refresh the lists when opening; close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    refreshDevices?.();

    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target))
        setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, refreshDevices]);

  // One switch at a time; the context already shows an error toast if it fails
  const run = async (key, fn) => {
    if (busyKey) return;
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  const { audioInputs, videoInputs, audioOutputs } = availableDevices;
  const speakers = audioOutputs.filter((d) => d.deviceId !== "default");
  const locked = Boolean(busyKey);

  return (
    <div ref={rootRef} className="contents">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Audio and video settings"
        title="Audio and video settings"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition",
          open
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-foreground hover:bg-muted/80",
        )}
      >
        <Settings2 className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Audio and video settings"
          // Centered on the control bar without CSS transforms (they would clash with the fade-in animation)
          style={{
            left: "50%",
            width: "min(20rem, calc(100vw - 2rem))",
            marginLeft: "calc(min(20rem, calc(100vw - 2rem)) / -2)",
          }}
          className="absolute bottom-full z-40 mb-3 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-2 text-white shadow-2xl backdrop-blur-xl animate-in fade-in duration-150"
        >
          {/* MICROPHONE */}
          <Section icon={Mic} title="Microphone">
            {audioInputs.length === 0 ? (
              <Empty>No microphone found</Empty>
            ) : (
              audioInputs.map((d, i) => {
                const selected = d.deviceId === selectedDevices.audioInputId;
                return (
                  <Option
                    key={d.deviceId || i}
                    label={cleanLabel(d.label, `Microphone ${i + 1}`)}
                    selected={selected}
                    busy={busyKey === `mic:${d.deviceId}`}
                    disabled={locked}
                    onClick={() =>
                      !selected &&
                      run(`mic:${d.deviceId}`, () =>
                        changeMicrophone(d.deviceId),
                      )
                    }
                  />
                );
              })
            )}
          </Section>

          {/* CAMERA (video calls only) */}
          {callType === "video" && (
            <Section
              icon={Video}
              title="Camera"
              hint={
                isScreenSharing
                  ? "Takes effect when you stop sharing your screen"
                  : null
              }
            >
              {canFlipCamera && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => run("flip", flipCamera)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5",
                    locked && busyKey !== "flip" && "opacity-50",
                  )}
                >
                  <SwitchCamera className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="flex-1">Flip camera</span>
                  {busyKey === "flip" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs text-zinc-400">
                      {cameraFacing === "environment" ? "Rear" : "Front"}
                    </span>
                  )}
                </button>
              )}

              {videoInputs.length === 0 ? (
                <Empty>No camera found</Empty>
              ) : (
                videoInputs.map((d, i) => {
                  const selected = d.deviceId === selectedDevices.videoInputId;
                  return (
                    <Option
                      key={d.deviceId || i}
                      label={cameraName(d, i, videoInputs)}
                      selected={selected}
                      busy={busyKey === `cam:${d.deviceId}`}
                      disabled={locked}
                      onClick={() =>
                        !selected &&
                        run(`cam:${d.deviceId}`, () => changeCamera(d.deviceId))
                      }
                    />
                  );
                })
              )}
            </Section>
          )}

          {/* SPEAKER */}
          <Section icon={Volume2} title="Speaker">
            {supportsOutputSelection ? (
              <>
                <Option
                  label="System default"
                  selected={!selectedDevices.audioOutputId}
                  busy={busyKey === "spk:"}
                  disabled={locked}
                  onClick={() =>
                    selectedDevices.audioOutputId &&
                    run("spk:", () => changeSpeaker(""))
                  }
                />
                {speakers.map((d, i) => {
                  const selected = d.deviceId === selectedDevices.audioOutputId;
                  return (
                    <Option
                      key={d.deviceId || i}
                      label={cleanLabel(d.label, `Speaker ${i + 1}`)}
                      selected={selected}
                      busy={busyKey === `spk:${d.deviceId}`}
                      disabled={locked}
                      onClick={() =>
                        !selected &&
                        run(`spk:${d.deviceId}`, () =>
                          changeSpeaker(d.deviceId),
                        )
                      }
                    />
                  );
                })}
              </>
            ) : (
              <Empty>Your browser chooses the speaker automatically</Empty>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
