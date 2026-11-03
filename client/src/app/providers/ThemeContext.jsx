import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { updateThemeRequest } from "@/api/usersApi";
import { applyTheme, DEFAULT_THEME, THEME_IDS } from "@/lib/themes";

const ThemeContext = createContext(null);

const readCached = () => {
  try {
    const t = localStorage.getItem("theme");
    return THEME_IDS.includes(t) ? t : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export function ThemeProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [theme, setThemeState] = useState(readCached);

  // When a user logs in / loads, adopt the theme saved on their account
  useEffect(() => {
    if (user?.theme && THEME_IDS.includes(user.theme)) {
      setThemeState(user.theme);
    }
  }, [user?.theme]);

  // Apply + cache. If "system", follow OS changes live.
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    async (next) => {
      const previous = theme;
      setThemeState(next); // instant feedback
      if (!user) return;
      try {
        const { data } = await updateThemeRequest(next);
        updateUser(data.user);
      } catch (err) {
        setThemeState(previous); // roll back if the server rejects it
        throw err;
      }
    },
    [theme, user, updateUser],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
