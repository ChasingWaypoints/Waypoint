/** @type {import('tailwindcss').Config} */
/**
 * Mirrors web/lib/theme.ts so the app and the site read as one product.
 *
 * The palette: near-black canvas, Uniform Blue panels, Palesun Yellow reserved
 * for brand and label accents, and the acid green that draws track lines on the
 * map doing double duty as the primary action colour — always with dark ink on
 * it, never white.
 */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary action — acid green, dark text on it
        primary:            "#CCFF00",
        "primary-active":   "#B8E600",
        "primary-disabled": "#2A3742",
        "on-primary":       "#0C1E29",

        // Brand accent — palesun yellow, for hero and labels, not buttons
        accent:      "#FFFE15",
        "accent-ink":"#0C1E29",
        "accent-dim":"#C9C810",

        // Surfaces
        canvas:                  "#0A0A0A",
        "surface-dark":          "#0A0A0A",
        "surface-dark-elevated": "#0C1E29",
        "surface-soft":          "#0C1E29",
        "surface-card":          "#0C1E29",
        "surface-strong":        "#14303F",

        // Text
        ink:           "#FFFFFF",
        body:          "#C8D4DC",
        "body-strong": "#FFFFFF",
        muted:         "#7E93A0",
        "muted-soft":  "#54697A",
        "on-dark":     "#FFFFFF",
        "on-dark-soft":"#7E93A0",

        // Lines
        hairline:          "#1E3B4C",
        "hairline-strong": "#2A4A5E",

        // Map + status, same values the web map uses
        track:  "#CCFF00",
        live:   "#CCFF00",
        stale:  "#FFAA00",
        "no-fix":"#54697A",

        success: "#CCFF00",
        warning: "#FFAA00",
        error:   "#FF3B30",
      },
      borderRadius: {
        none:    "0px",
        sm:      "4px",
        DEFAULT: "8px",
        md:      "8px",
        lg:      "10px",
        xl:      "12px",
        "2xl":   "16px",
        full:    "9999px",
      },
    },
  },
  plugins: [],
};
