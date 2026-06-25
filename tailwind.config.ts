import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--phone)",
        card: "var(--card)",
        tile: "var(--tile)",
        seg: "var(--seg)",
        rule: "var(--line)",
        ink: "var(--ink)",
        ink2: "var(--ink2)",
        "ink-muted": "var(--muted)",
        emerald: "#3E7D5A",
        accent: "#C75B39",
        gold: "#E3B23C",
        "strat-a": "#C75B39",
        "strat-b": "#4A6FA5",
        "strat-c": "#836FB2",
        "strat-d": "#4F8B82",
        "strat-e": "#B89968",
        "strat-f": "#2D7A4F",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontVariantNumeric: {
        "tabular-nums": "tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
