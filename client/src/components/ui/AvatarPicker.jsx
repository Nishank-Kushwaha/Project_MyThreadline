import React, { useEffect, useMemo, useState } from "react";
import { createAvatar } from "@dicebear/core";
import * as collection from "@dicebear/collection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  X,
  Dices,
  Download,
  Sparkles,
  RotateCcw,
  Palette,
  LayoutGrid,
  Wand2,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

// Every style DiceBear ships (anything missing in your installed version is skipped).
const STYLE_KEYS = [
  "adventurer",
  "adventurerNeutral",
  "avataaars",
  "avataaarsNeutral",
  "bigEars",
  "bigEarsNeutral",
  "bigSmile",
  "bottts",
  "botttsNeutral",
  "croodles",
  "croodlesNeutral",
  "dylan",
  "funEmoji",
  "glass",
  "icons",
  "identicon",
  "initials",
  "lorelei",
  "loreleiNeutral",
  "micah",
  "miniavs",
  "notionists",
  "notionistsNeutral",
  "openPeeps",
  "personas",
  "pixelArt",
  "pixelArtNeutral",
  "rings",
  "shapes",
  "thumbs",
  "toonHead",
].filter((k) => collection[k]);

// Options handled by the "Look" tab; everything else comes from the style's own schema.
const CORE_KEYS = new Set([
  "seed",
  "flip",
  "rotate",
  "scale",
  "radius",
  "size",
  "backgroundColor",
  "backgroundType",
  "backgroundRotation",
  "translateX",
  "translateY",
  "clip",
  "randomizeIds",
]);

const BG_SWATCHES = [
  "b6e3f4",
  "c0aede",
  "d1d4f9",
  "ffd5dc",
  "ffdfbf",
  "fde68a",
  "bbf7d0",
  "fecaca",
  "e2e8f0",
  "1e293b",
];

const BG_TYPES = [
  { id: "solid", label: "Solid" },
  { id: "gradientLinear", label: "Gradient" },
  { id: "transparent", label: "None" },
];

const DEFAULT_LOOK = {
  flip: false,
  rotate: 0,
  scale: 100,
  radius: 0,
  translateX: 0,
  translateY: 0,
  bgType: "solid",
  bgColors: ["b6e3f4", "c0aede", "d1d4f9"],
  bgRotation: 0,
};

const TABS = [
  { id: "style", label: "Style", icon: LayoutGrid },
  { id: "gallery", label: "Variations", icon: Sparkles },
  { id: "look", label: "Look", icon: Palette },
  { id: "features", label: "Features", icon: SlidersHorizontal },
];

const humanize = (s) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const randomSeed = () => Math.random().toString(36).slice(2, 10);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isHex = (v) => typeof v === "string" && /^[a-fA-F0-9]{6}$/.test(v);

function buildOptions(look, styleOptions, extra = {}) {
  const o = {
    flip: look.flip,
    rotate: look.rotate,
    scale: look.scale,
    radius: look.radius,
    translateX: look.translateX,
    translateY: look.translateY,
    randomizeIds: true,
    ...styleOptions,
    ...extra,
  };

  if (look.bgType === "transparent") {
    o.backgroundColor = ["transparent"];
  } else {
    o.backgroundColor = look.bgColors;
    o.backgroundType = [look.bgType];
    o.backgroundRotation = [look.bgRotation, look.bgRotation];
  }
  return o;
}

function renderAvatar(style, options) {
  try {
    return createAvatar(style, options);
  } catch {
    return null;
  }
}

const toUri = (style, options) =>
  renderAvatar(style, options)?.toDataUri() ?? "";

// Classify a property from the style's JSON schema so controls can be generated automatically.
function classify(def) {
  if (!def) return null;
  if (def.type === "array" && def.items?.enum) return "variant";
  if (def.type === "array" && def.items?.pattern) return "color";
  if (def.type === "boolean") return "bool";
  if (def.type === "integer" || def.type === "number") return "range";
  return null;
}

async function svgToPngFile(svgDataUri, size = 512, name = "avatar") {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = svgDataUri;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(img, 0, 0, size, size);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't render the avatar.");
  return new File([blob], `${name}.png`, { type: "image/png" });
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

function Field({ label, value, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {value !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {value}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, onChange, suffix = "" }) {
  return (
    <Field label={label} value={`${value}${suffix}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </Field>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}

function Tile({ src, active, label, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-muted/40 p-1 text-center transition",
        "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary ring-2 ring-primary/40" : "border-border",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="aspect-square w-full rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="aspect-square w-full rounded-lg bg-muted" />
      )}
      {label && (
        <span className="mt-1 block truncate px-1 text-[11px] text-muted-foreground">
          {label}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function AvatarPicker({ initialSeed = "", onSave, onClose }) {
  const [tab, setTab] = useState("style");
  const [styleKey, setStyleKey] = useState("adventurer");
  const [seed, setSeed] = useState(() => initialSeed || randomSeed());
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [styleOptions, setStyleOptions] = useState({});
  const [galleryRound, setGalleryRound] = useState(0);
  const [openGroup, setOpenGroup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const style = collection[styleKey];

  const setLookValue = (key, value) => setLook((l) => ({ ...l, [key]: value }));
  const setOpt = (key, value) =>
    setStyleOptions((o) => ({ ...o, [key]: value }));
  const clearOpt = (key) =>
    setStyleOptions((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });

  // Lock page scroll behind the sheet (important on phones)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Style-specific controls come straight from the style's JSON schema.
  const schemaProps = useMemo(() => {
    const props = style?.schema?.properties ?? {};
    return Object.entries(props).filter(([key]) => !CORE_KEYS.has(key));
  }, [style]);

  const options = useMemo(
    () => buildOptions(look, styleOptions, { seed }),
    [look, styleOptions, seed],
  );

  const avatar = useMemo(
    () => renderAvatar(style, { ...options, size: 512 }),
    [style, options],
  );
  const previewUri = useMemo(() => avatar?.toDataUri() ?? "", [avatar]);

  // Style grid: every style rendered with the current seed + look
  const styleThumbs = useMemo(() => {
    if (tab !== "style") return {};
    const base = buildOptions(look, {}, { seed, size: 128 });
    return Object.fromEntries(
      STYLE_KEYS.map((k) => [k, toUri(collection[k], base)]),
    );
  }, [tab, seed, look]);

  // Variations: 12 fresh seeds in the current style/look/features
  const gallery = useMemo(() => {
    if (tab !== "gallery") return [];
    return Array.from({ length: 12 }, () => {
      const s = randomSeed();
      return {
        seed: s,
        uri: toUri(style, {
          ...buildOptions(look, styleOptions, { seed: s }),
          size: 128,
        }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, galleryRound, style, look, styleOptions]);

  const changeStyle = (key) => {
    setStyleKey(key);
    setStyleOptions({});
    setOpenGroup(null);
  };

  const reset = () => {
    setLook(DEFAULT_LOOK);
    setStyleOptions({});
  };

  const surprise = () => {
    const key = pick(STYLE_KEYS);
    setStyleKey(key);
    setStyleOptions({});
    setOpenGroup(null);
    setSeed(randomSeed());
    setLook({
      ...DEFAULT_LOOK,
      flip: Math.random() < 0.2,
      bgType: pick(["solid", "gradientLinear"]),
      bgColors: [pick(BG_SWATCHES), pick(BG_SWATCHES)],
      bgRotation: pick([0, 45, 90, 180, 270]),
    });
  };

  const selectVariant = (key, value) => {
    const probKey = `${key}Probability`;
    setStyleOptions((o) => ({
      ...o,
      [key]: [value],
      // Make sure the chosen part actually shows up
      ...(schemaProps.some(([k]) => k === probKey) && o[probKey] === undefined
        ? { [probKey]: 100 }
        : {}),
    }));
  };

  const toggleBgColor = (hex) =>
    setLook((l) => {
      const has = l.bgColors.includes(hex);
      const next = has
        ? l.bgColors.filter((c) => c !== hex)
        : [...l.bgColors, hex];
      return { ...l, bgColors: next.length ? next : l.bgColors };
    });

  const downloadSvg = () => {
    if (!avatar) return;
    const url = URL.createObjectURL(
      new Blob([avatar.toString()], { type: "image/svg+xml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `avatar-${styleKey}-${seed}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!previewUri) return;
    setSaving(true);
    setError("");
    try {
      const file = await svgToPngFile(previewUri, 512, `avatar-${styleKey}`);
      await onSave(file);
      onClose();
    } catch (err) {
      setError(err?.message || "Couldn't use that avatar. Try another one.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------- tab bodies --------------------------- */

  const renderStyleTab = () => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {STYLE_KEYS.map((key) => (
        <Tile
          key={key}
          src={styleThumbs[key]}
          label={humanize(key)}
          active={key === styleKey}
          onClick={() => changeStyle(key)}
        />
      ))}
    </div>
  );

  const renderGalleryTab = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Same style and look, new faces. Click one to use it.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setGalleryRound((n) => n + 1)}
        >
          <Dices className="mr-1.5 h-4 w-4" />
          Shuffle
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {gallery.map((g) => (
          <Tile
            key={g.seed}
            src={g.uri}
            active={g.seed === seed}
            label={g.seed}
            onClick={() => setSeed(g.seed)}
          />
        ))}
      </div>
    </div>
  );

  const renderLookTab = () => (
    <div className="space-y-5">
      <Field label="Background">
        <div className="flex gap-2">
          {BG_TYPES.map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={look.bgType === t.id ? "default" : "outline"}
              onClick={() => setLookValue("bgType", t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </Field>

      {look.bgType !== "transparent" && (
        <>
          <Field
            label="Background colors"
            value={`${look.bgColors.length} selected`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {BG_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => toggleBgColor(hex)}
                  aria-label={`Toggle #${hex}`}
                  aria-pressed={look.bgColors.includes(hex)}
                  style={{ backgroundColor: `#${hex}` }}
                  className={cn(
                    "h-8 w-8 rounded-full border transition hover:scale-110",
                    look.bgColors.includes(hex)
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "border-border",
                  )}
                />
              ))}
              <input
                type="color"
                aria-label="Add custom color"
                className="h-8 w-8 cursor-pointer rounded-full border border-input bg-transparent p-0"
                onChange={(e) => {
                  const hex = e.target.value.slice(1);
                  setLook((l) =>
                    l.bgColors.includes(hex)
                      ? l
                      : { ...l, bgColors: [...l.bgColors, hex] },
                  );
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              With several colors selected, the seed picks one for each avatar.
            </p>
          </Field>

          {look.bgType === "gradientLinear" && (
            <Range
              label="Gradient angle"
              value={look.bgRotation}
              min={0}
              max={360}
              step={15}
              suffix="°"
              onChange={(v) => setLookValue("bgRotation", v)}
            />
          )}
        </>
      )}

      <Range
        label="Corner radius"
        value={look.radius}
        min={0}
        max={50}
        suffix="%"
        onChange={(v) => setLookValue("radius", v)}
      />
      <Range
        label="Scale"
        value={look.scale}
        min={50}
        max={200}
        suffix="%"
        onChange={(v) => setLookValue("scale", v)}
      />
      <Range
        label="Rotate"
        value={look.rotate}
        min={0}
        max={360}
        suffix="°"
        onChange={(v) => setLookValue("rotate", v)}
      />
      <Range
        label="Move horizontally"
        value={look.translateX}
        min={-50}
        max={50}
        onChange={(v) => setLookValue("translateX", v)}
      />
      <Range
        label="Move vertically"
        value={look.translateY}
        min={-50}
        max={50}
        onChange={(v) => setLookValue("translateY", v)}
      />
      <Toggle
        label="Flip horizontally"
        checked={look.flip}
        onChange={(v) => setLookValue("flip", v)}
      />
    </div>
  );

  const renderFeaturesTab = () => {
    const variants = schemaProps.filter(([, d]) => classify(d) === "variant");
    const others = schemaProps.filter(
      ([, d]) => classify(d) && classify(d) !== "variant",
    );

    if (!variants.length && !others.length) {
      return (
        <p className="text-sm text-muted-foreground">
          {humanize(styleKey)} has no extra features. Change the seed, or use
          the Look tab.
        </p>
      );
    }

    return (
      <div className="space-y-5">
        {variants.length > 0 && (
          <div className="space-y-2">
            {variants.map(([key, def]) => {
              const values = def.items.enum;
              const selected = styleOptions[key]?.[0];
              const open = openGroup === key;
              const probKey = `${key}Probability`;
              const hasProb = schemaProps.some(([k]) => k === probKey);

              return (
                <div key={key} className="rounded-xl border">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(open ? null : key)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
                    aria-expanded={open}
                  >
                    <span>{humanize(key)}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {selected ? humanize(String(selected)) : "Random"}
                    </span>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t p-3">
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        <button
                          type="button"
                          onClick={() => clearOpt(key)}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-xl border text-xs hover:border-primary/60",
                            !selected
                              ? "border-primary ring-2 ring-primary/40"
                              : "border-border",
                          )}
                        >
                          <Dices className="h-5 w-5" />
                        </button>
                        {values.map((v) => (
                          <Tile
                            key={v}
                            label={String(v)}
                            active={selected === v}
                            onClick={() => selectVariant(key, v)}
                            src={toUri(style, {
                              ...buildOptions(look, styleOptions, {
                                seed,
                                size: 96,
                              }),
                              [key]: [v],
                              ...(hasProb ? { [probKey]: 100 } : {}),
                            })}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-4">
            {others.map(([key, def]) => {
              const kind = classify(def);

              if (kind === "color") {
                const current =
                  styleOptions[key]?.[0] ??
                  def.default?.find?.(isHex) ??
                  "888888";
                return (
                  <Field
                    key={key}
                    label={humanize(key)}
                    value={styleOptions[key] ? `#${current}` : "Random"}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={`#${current}`}
                        onChange={(e) => setOpt(key, [e.target.value.slice(1)])}
                        className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0"
                      />
                      {styleOptions[key] && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => clearOpt(key)}
                        >
                          Use random
                        </Button>
                      )}
                    </div>
                  </Field>
                );
              }

              if (kind === "bool") {
                return (
                  <Toggle
                    key={key}
                    label={humanize(key)}
                    checked={styleOptions[key] ?? Boolean(def.default)}
                    onChange={(v) => setOpt(key, v)}
                  />
                );
              }

              if (kind === "range") {
                const isInt = def.type === "integer";
                const min = def.minimum ?? 0;
                const max = def.maximum ?? 100;
                return (
                  <Range
                    key={key}
                    label={humanize(key)}
                    min={min}
                    max={max}
                    step={isInt ? 1 : (max - min) / 100}
                    value={styleOptions[key] ?? def.default ?? min}
                    suffix={key.endsWith("Probability") ? "%" : ""}
                    onChange={(v) => setOpt(key, v)}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------ layout ----------------------------- */

  const seedRow = (
    <div className="flex gap-2">
      <Input
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        placeholder="Type anything"
        aria-label="Seed"
        className="text-base md:text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Random seed"
        className="shrink-0"
        onClick={() => setSeed(randomSeed())}
      >
        <Dices className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-100 flex items-stretch justify-center bg-black/70 backdrop-blur-md md:items-center md:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Avatar picker"
    >
      {/* Full-screen sheet on phones, centered card from md up */}
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background md:h-auto md:max-h-[90vh] md:max-w-4xl md:flex-row md:rounded-2xl md:border md:shadow-2xl">
        {/* ---------- Mobile header: compact preview + seed + actions ---------- */}
        <div className="shrink-0 space-y-2 border-b bg-muted/30 p-3 md:hidden">
          <div className="flex items-center gap-3">
            <img
              src={previewUri}
              alt="Avatar preview"
              className="h-16 w-16 shrink-0 rounded-xl border bg-background"
            />
            <div className="min-w-0 flex-1">
              <h2 className="mb-1.5 text-sm font-semibold">Avatar picker</h2>
              {seedRow}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close avatar picker"
              className="self-start rounded-full p-2 text-muted-foreground active:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={surprise}
            >
              <Wand2 className="mr-1 h-4 w-4" />
              Surprise
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadSvg}
            >
              <Download className="mr-1 h-4 w-4" />
              SVG
            </Button>
          </div>
        </div>

        {/* ---------- Desktop sidebar ---------- */}
        <aside className="hidden shrink-0 flex-col gap-4 border-r bg-muted/30 p-5 md:flex md:w-72">
          <h2 className="text-base font-semibold">Avatar picker</h2>

          <div className="w-full overflow-hidden rounded-2xl border bg-background shadow-sm">
            {previewUri ? (
              <img
                src={previewUri}
                alt="Avatar preview"
                className="aspect-square w-full"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">
                Couldn't render
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <img
              src={previewUri}
              alt=""
              className="h-10 w-10 rounded-full border"
            />
            <img
              src={previewUri}
              alt=""
              className="h-6 w-6 rounded-full border"
            />
            <span>How it will appear</span>
          </div>

          <Field label="Seed">
            {seedRow}
            <p className="text-xs text-muted-foreground">
              The same seed always gives the same avatar.
            </p>
          </Field>

          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={surprise}
            >
              <Wand2 className="mr-1.5 h-4 w-4" />
              Surprise me
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="col-span-2 border border-input"
              onClick={downloadSvg}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Download SVG
            </Button>
          </div>
        </aside>

        {/* ---------- Controls ---------- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 pt-2 sm:px-5 md:pt-3">
            <div
              role="tablist"
              className="grid flex-1 grid-cols-4 md:flex md:flex-none md:gap-1"
            >
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex touch-manipulation flex-col items-center justify-center gap-0.5 border-b-2 px-1 pb-2 pt-1 text-[11px] font-medium transition",
                    "md:flex-row md:gap-1.5 md:px-3 md:text-sm",
                    tab === id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close avatar picker"
              className="mb-2 hidden rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:block"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
            {tab === "style" && renderStyleTab()}
            {tab === "gallery" && renderGalleryTab()}
            {tab === "look" && renderLookTab()}
            {tab === "features" && renderFeaturesTab()}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <p
              className={cn(
                "min-w-0 truncate text-sm",
                error
                  ? "text-destructive"
                  : "hidden text-muted-foreground sm:block",
              )}
            >
              {error || `${humanize(styleKey)} style`}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                onClick={handleSave}
                disabled={saving || !previewUri}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Use this avatar"
                )}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
