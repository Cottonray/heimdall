import { useEffect, useState } from "react";
export type Theme = "light" | "dark";
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem("heimdall.theme") === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("heimdall.theme", theme);
    } catch {
      /* Private storage can be disabled. */
    }
  }, [theme]);
  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
