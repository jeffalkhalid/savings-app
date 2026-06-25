"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { resolveInitialTheme, nextTheme, type Theme } from "@/lib/cockpit/theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  let stored: string | null = null;
  let prefersDark = false;
  try {
    stored = window.localStorage.getItem("theme");
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    /* mode privé : repli préférence par défaut */
  }
  return resolveInitialTheme(stored, prefersDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Synchronise l'état React avec ce que le script anti-flash a déjà appliqué.
  useEffect(() => {
    setTheme(readInitial());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => nextTheme(t));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
