export type Theme = "light" | "dark";

// Préférence effective au démarrage : valeur stockée si explicite, sinon préférence système.
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean
): Theme {
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
