export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export function normalizePref(stored: string | null): ThemePref {
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): Theme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
