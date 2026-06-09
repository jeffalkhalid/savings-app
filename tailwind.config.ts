import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F4",
        ink: "#1A1B1F",
        "ink-muted": "#6B6E76",
        rule: "#E5E2DC",
        emerald: "#1B5E40",
        "strat-a": "#B45342",
        "strat-b": "#4A6FA5",
        "strat-c": "#836FB2",
        "strat-d": "#4F8B82",
        "strat-e": "#B89968",
        "strat-f": "#2D7A4F",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Geist", "system-ui", "sans-serif"],
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
