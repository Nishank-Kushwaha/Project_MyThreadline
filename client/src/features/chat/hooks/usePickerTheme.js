import { useTheme } from "@/context/ThemeContext";
import { THEMES, getSystemTheme } from "@/lib/themes";

// Same rule as applyTheme(): themes with a palette use their `dark` flag,
// and plain "dark" (no palette) is dark.
export function usePickerTheme() {
  const { theme } = useTheme();
  const resolved = theme === "system" ? getSystemTheme() : theme;
  const entry = THEMES.find((t) => t.id === resolved && t.vars);
  return (entry ? entry.dark : true) ? "dark" : "light";
}
