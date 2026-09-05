/**
 * Waypoint theme.
 *
 * Dark canvas with a palesun-yellow accent. The reason this palette
 * suits a tracking product rather than just looking good: the map is
 * satellite imagery, which is dark, busy and low-contrast. Chrome that
 * sits on a near-black ground disappears against it instead of fighting
 * it, and a single high-chroma accent stays legible over desert, scrub
 * and shadow alike.
 *
 * Track lines use acid green rather than the brand yellow so that a
 * rider's trail never reads as a button or a control.
 */

export const theme = {
  // ── Ground ──────────────────────────────────────────────────
  canvas: "#0A0A0A",        // page background
  surface: "#0C1E29",       // uniform blue — panels, sidebars, cards
  surfaceRaised: "#12293700", // (unused placeholder, see surfaceHi)
  surfaceHi: "#14303F",     // hovered / selected rows
  hairline: "#1E3B4C",      // borders on the blue surface
  hairlineSoft: "#152D3B",

  // ── Accent ──────────────────────────────────────────────────
  accent: "#FFFE15",        // palesun yellow — primary actions, brand
  accentInk: "#0C1E29",     // text ON the accent
  accentDim: "#C9C810",     // pressed / disabled accent

  // ── Text ────────────────────────────────────────────────────
  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#7E93A0",
  faint: "#54697A",

  // ── Map data ────────────────────────────────────────────────
  track: "#CCFF00",         // acid green — entrant trail
  trackCasing: "#000000",
  route: "#FFFE15",         // organizer's planned route
  measure: "#FF4D2E",       // measuring line — must not be confusable

  // ── Status ──────────────────────────────────────────────────
  live: "#CCFF00",
  stale: "#FFAA00",
  dark: "#FF3B30",
  noFix: "#54697A",

  // ── Feedback ────────────────────────────────────────────────
  danger: "#FF3B30",
  dangerSurface: "#2A1214",
  warn: "#FFAA00",
} as const;

// Type scale — the sizes already in de-facto use across the app, named so new
// and refactored code can stay on the scale instead of picking numbers ad hoc.
export const text = {
  xxs: 10,  // micro labels, pulse/live chips
  xs: 11,   // labels, chips, meta
  sm: 12,   // secondary text
  base: 13, // body / controls
  md: 14,   // emphasized body
  lg: 15,   // card titles
  xl: 18,   // section headings
  xxl: 22,  // page headings
} as const;

export const font = {
  sans: "var(--font-sans), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  display: "var(--font-display), 'Barlow Condensed', system-ui, sans-serif",
};

// ── Shared control styles ─────────────────────────────────────

export const btnPrimary: React.CSSProperties = {
  background: theme.accent,
  color: theme.accentInk,
  border: "none",
  borderRadius: 4,
  padding: "9px 18px",
  font: `700 13px ${font.sans}`,
  letterSpacing: 0.2,
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: theme.body,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 4,
  padding: "9px 18px",
  font: `500 13px ${font.sans}`,
  cursor: "pointer",
};

export const btnMap: React.CSSProperties = {
  background: theme.surface,
  color: theme.ink,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 999,
  padding: "8px 15px",
  font: `600 13px ${font.sans}`,
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(0,0,0,.5)",
  display: "inline-flex",
  alignItems: "center",
};

export const panel: React.CSSProperties = {
  marginTop: 6,
  background: theme.surface,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 10,
  boxShadow: "0 8px 28px rgba(0,0,0,.55)",
  minWidth: 240,
  overflow: "hidden",
};

export const input: React.CSSProperties = {
  background: theme.canvas,
  color: theme.ink,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 4,
  padding: "9px 11px",
  font: `13px ${font.sans}`,
};

export const card: React.CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};
