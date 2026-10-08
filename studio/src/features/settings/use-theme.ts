import { useEffect, useState, useSyncExternalStore } from "react";
export type ResolvedTheme = "light" | "dark";
export type Theme = ResolvedTheme | "system";
const mediaQuery = "(prefers-color-scheme: dark)";
function subscribeSystemTheme(onChange: () => void) {
  const media = window.matchMedia(mediaQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const systemIsDark = () => window.matchMedia(mediaQuery).matches;
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("heimdall.theme");
      return saved === "dark" || saved === "system" ? saved : "light";
    } catch {
      return "light";
    }
  });
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    systemIsDark,
    () => false,
  );
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    try {
      localStorage.setItem("heimdall.theme", theme);
    } catch {
      /* Private storage can be disabled. */
    }
  }, [theme, resolvedTheme]);
  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  };
}
