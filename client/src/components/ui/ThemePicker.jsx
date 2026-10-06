import React, { useState } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

function Swatch({ t }) {
  if (t.id === "system") {
    return (
      <div className="h-10 w-full overflow-hidden rounded-md border border-input">
        <div
          className="h-full w-full"
          style={{
            background: "linear-gradient(135deg, #ffffff 50%, #0f172a 50%)",
          }}
        />
      </div>
    );
  }
  if (t.id === "dark") {
    return (
      <div
        className="flex h-10 w-full items-end gap-1 rounded-md border border-input p-1.5"
        style={{ background: "#0f1219" }}
      >
        <span
          className="h-2 w-6 rounded-sm"
          style={{ background: "#262c3a" }}
        />
        <span
          className="h-2 w-3 rounded-sm"
          style={{ background: "#1fc8a8" }}
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-10 w-full items-end gap-1 rounded-md border p-1.5"
      style={{
        background: `hsl(${t.vars["--background"]})`,
        borderColor: `hsl(${t.vars["--border"]})`,
      }}
    >
      <span
        className="h-2 w-6 rounded-sm"
        style={{ background: `hsl(${t.vars["--muted"]})` }}
      />
      <span
        className="h-2 w-3 rounded-sm"
        style={{ background: `hsl(${t.vars["--primary"]})` }}
      />
    </div>
  );
}

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [error, setError] = useState("");

  const choose = async (id) => {
    setError("");
    try {
      await setTheme(id);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your theme.");
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              aria-pressed={active}
              className={cn(
                "rounded-lg border p-2 text-left transition hover:bg-accent",
                active
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-input",
              )}
            >
              <Swatch t={t} />
              <div className="mt-2 flex items-center justify-between text-sm font-medium">
                {t.label}
                {active && <Check className="h-4 w-4 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
