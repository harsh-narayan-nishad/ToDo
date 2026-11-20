import type { Config } from "tailwindcss";

// Same design tokens as the main Pacewise app (colors, type scale, fonts) so To-do looks like part of it.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'PP Neue Montreal'", "'Inter'", "'Söhne'", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Roobert'", "'Inter'", "'Söhne'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'PP Neue Montreal Mono'", "'JetBrains Mono'", "'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        sm: ["14px", { lineHeight: "20px", letterSpacing: "0" }],
        base: ["16px", { lineHeight: "24px", letterSpacing: "0.01em" }],
        lg: ["18px", { lineHeight: "26px", letterSpacing: "0.005em" }],
        xl: ["20px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
        "2xl": ["24px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
        "3xl": ["32px", { lineHeight: "37px", letterSpacing: "-0.025em" }],
      },
      colors: {
        canvas: { DEFAULT: "rgb(var(--canvas) / <alpha-value>)", raised: "rgb(var(--canvas-raised) / <alpha-value>)" },
        ink: { DEFAULT: "rgb(var(--ink) / <alpha-value>)", muted: "rgb(var(--ink-muted) / <alpha-value>)", faint: "rgb(var(--ink-faint) / <alpha-value>)" },
        overlay: "rgb(var(--overlay) / <alpha-value>)",
        accent: { slow: "#5FA8D3", medium: "#7FC97F", fast: "#E8B84B", extreme: "#E05B5B" },
      },
      boxShadow: { themed: "0 8px 30px -6px rgb(var(--shadow-color) / 0.35)" },
    },
  },
  plugins: [],
};
export default config;
