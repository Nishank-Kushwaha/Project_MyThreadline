// Values are raw HSL triplets because index.css uses hsl(var(--x)).
// "dark" has no palette: it is the default :root in index.css.

const palette = (
  dark,
  bg,
  fg,
  card,
  primary,
  primaryFg,
  muted,
  mutedFg,
  border,
) => ({
  dark,
  vars: {
    "--background": bg,
    "--foreground": fg,
    "--card": card,
    "--card-foreground": fg,
    "--popover": card,
    "--popover-foreground": fg,
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--secondary": muted,
    "--secondary-foreground": fg,
    "--muted": muted,
    "--muted-foreground": mutedFg,
    "--accent": muted,
    "--accent-foreground": fg,
    "--border": border,
    "--input": border,
    "--ring": primary,
  },
});

export const THEMES = [
  { id: "system", label: "System" },
  { id: "dark", label: "Dark" },
  {
    id: "light",
    label: "Light",
    ...palette(
      false,
      "210 40% 98%",
      "222 30% 12%",
      "0 0% 100%",
      "168 76% 36%",
      "0 0% 100%",
      "214 32% 93%",
      "215 16% 40%",
      "214 25% 86%",
    ),
  },
  {
    id: "ocean",
    label: "Ocean",
    ...palette(
      false,
      "204 100% 97%",
      "205 71% 16%",
      "0 0% 100%",
      "200 98% 39%",
      "0 0% 100%",
      "201 94% 94%",
      "207 28% 41%",
      "201 94% 86%",
    ),
  },
  {
    id: "mint",
    label: "Mint",
    ...palette(
      false,
      "164 82% 97%",
      "169 82% 12%",
      "0 0% 100%",
      "175 84% 32%",
      "0 0% 100%",
      "167 85% 89%",
      "169 27% 35%",
      "168 84% 78%",
    ),
  },
  {
    id: "sunset",
    label: "Sunset",
    ...palette(
      false,
      "33 100% 96%",
      "22 66% 14%",
      "0 0% 100%",
      "21 90% 48%",
      "0 0% 100%",
      "34 100% 92%",
      "23 39% 41%",
      "32 98% 83%",
    ),
  },
  {
    id: "rose",
    label: "Rose",
    ...palette(
      false,
      "356 100% 97%",
      "340 88% 15%",
      "0 0% 100%",
      "347 77% 50%",
      "0 0% 100%",
      "356 100% 95%",
      "347 36% 46%",
      "353 96% 90%",
    ),
  },
  {
    id: "lavender",
    label: "Lavender",
    ...palette(
      false,
      "270 100% 98%",
      "261 74% 23%",
      "0 0% 100%",
      "271 81% 56%",
      "0 0% 100%",
      "269 100% 95%",
      "270 29% 47%",
      "269 100% 92%",
    ),
  },
  {
    id: "forest",
    label: "Forest",
    ...palette(
      true,
      "150 35% 9%",
      "138 38% 93%",
      "148 31% 13%",
      "158 64% 52%",
      "154 80% 10%",
      "146 27% 16%",
      "142 15% 66%",
      "147 29% 21%",
    ),
  },
  {
    id: "midnight",
    label: "Midnight",
    ...palette(
      true,
      "225 47% 9%",
      "214 32% 91%",
      "223 45% 13%",
      "239 84% 67%",
      "0 0% 100%",
      "223 42% 18%",
      "215 20% 65%",
      "223 38% 22%",
    ),
  },
  {
    id: "coffee",
    label: "Coffee",
    ...palette(
      true,
      "23 28% 9%",
      "30 56% 91%",
      "24 27% 12%",
      "29 52% 64%",
      "23 28% 9%",
      "24 28% 16%",
      "28 21% 63%",
      "23 22% 22%",
    ),
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "system";

const ALL_VAR_NAMES = Object.keys(THEMES.find((t) => t.id === "light").vars);

export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(id) {
  const root = document.documentElement;
  const resolved = id === "system" ? getSystemTheme() : id;
  const custom = THEMES.find((t) => t.id === resolved && t.vars);

  ALL_VAR_NAMES.forEach((v) => root.style.removeProperty(v));
  if (custom) {
    Object.entries(custom.vars).forEach(([k, v]) =>
      root.style.setProperty(k, v),
    );
  }

  const isDark = custom ? custom.dark : true;
  root.classList.toggle("dark", isDark);
  root.dataset.theme = id;
  root.style.colorScheme = isDark ? "dark" : "light";
}
