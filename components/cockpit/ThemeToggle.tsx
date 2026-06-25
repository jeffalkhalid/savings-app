"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/cockpit/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
      className="w-9 h-9 rounded-xl border border-rule bg-card text-ink-muted flex items-center justify-center"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
