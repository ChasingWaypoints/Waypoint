/**
 * theme.ts
 *
 * The brand palette as plain JS values, mirroring web/lib/theme.ts.
 *
 * Tailwind classes cover anything we render ourselves, but navigation chrome —
 * tab bar, stack headers — is configured with style objects, so it needs the
 * same tokens in a form JS can pass around. Without this the chrome kept its
 * defaults: white bars and #1c69d4 blue, which is why the app read as a
 * different product from the site.
 */

export const theme = {
  canvas: "#0A0A0A",
  surface: "#0C1E29",
  surfaceHi: "#14303F",
  hairline: "#1E3B4C",
  hairlineSoft: "#152D3B",

  accent: "#FFFE15",
  accentInk: "#0C1E29",

  action: "#CCFF00",
  actionInk: "#0C1E29",

  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#7E93A0",
  faint: "#54697A",

  track: "#CCFF00",
  danger: "#FF3B30",
  warn: "#FFAA00",
} as const;

/** Shared by every Stack in the app so headers cannot drift apart again. */
export const stackHeader = {
  headerStyle: { backgroundColor: theme.surface },
  headerTintColor: theme.ink,
  headerTitleStyle: {
    fontWeight: "700" as const,
    fontSize: 15,
    letterSpacing: 0.5,
    color: theme.ink,
  },
  headerShadowVisible: false,
};
