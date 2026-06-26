"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  normalizePref,
  resolveTheme,
  type Theme,
  type ThemePref,
} from "@/lib/cockpit/theme";

const ThemeContext = createContext<{
  theme: Theme;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}>({
  theme: "light",
  pref: "system",
  setPref: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    return normalizePref(window.localStorage.getItem("theme"));
  } catch {
    return "system";
  }
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>("system");
  const [theme, setTheme] = useState<Theme>("light");

  // Init après montage (le script anti-flash a déjà posé la classe).
  useEffect(() => {
    const p = readPref();
    setPref(p);
    setTheme(resolveTheme(p, prefersDark()));
  }, []);

  // Recalcule + persiste quand la préférence change ; suit l'OS en mode system.
  useEffect(() => {
    setTheme(resolveTheme(pref, prefersDark()));
    try {
      window.localStorage.setItem("theme", pref);
    } catch {
      /* ignore */
    }
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(resolveTheme("system", mq.matches));
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, pref, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}
