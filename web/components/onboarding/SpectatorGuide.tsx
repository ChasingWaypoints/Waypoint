"use client";

import { useEffect, useState } from "react";
import { theme, font, text } from "../../lib/theme";

/**
 * SpectatorGuide — first-visit onboarding for the people who did NOT build the
 * event: fans, families and sponsors who open a public tracking link and need
 * to know, in five seconds, what they are looking at.
 *
 * Design choices:
 *  - It shows itself once per browser (localStorage), so a returning spectator
 *    is never nagged, and a small "?" button in the corner lets anyone pull it
 *    back up on demand (also how an organizer demos it on a screen-share).
 *  - It is a light card, not a full-screen takeover — the live map is the point,
 *    so the guide sits over one corner and the map keeps moving behind it.
 *  - Content is a short, plain-language legend keyed to what is actually on the
 *    map: coloured status dots, tap-for-detail, and the layer switcher.
 *
 * Deliberately dependency-free. Drop it on any public spectator page.
 */

type Variant = "event" | "trip";

const COPY: Record<
  Variant,
  { key: string; title: string; lead: string; rows: { dot?: string; label: string; body: string }[] }
> = {
  event: {
    key: "wp_guide_event_v1",
    title: "Following the event",
    lead: "Every rider carries their own satellite beacon. Here they are on one live map.",
    rows: [
      { dot: theme.live, label: "Live", body: "A rider whose beacon reported in recently. Green means moving and current." },
      { dot: theme.stale, label: "Quiet", body: "Amber means it has been a while since their last fix — normal in a canyon or dead zone." },
      { dot: theme.dark, label: "No signal", body: "Red or grey means no recent position. Terrain and weather do this; it usually clears." },
      { label: "Tap a rider", body: "Open any dot for their number, speed, last update and local weather — and the trail of where they've been." },
      { label: "Switch the map", body: "Use the layers button to flip between satellite, topo and streets. Satellite is sharpest over open country." },
    ],
  },
  trip: {
    key: "wp_guide_trip_v1",
    title: "Following this rider",
    lead: "You're watching one rider's track. If they're out now, it updates live.",
    rows: [
      { dot: theme.route, label: "The line", body: "Their route so far. The dot at the end is where they are now — or where the trip finished." },
      { dot: theme.live, label: "Live badge", body: "A pulsing “Live” up top means the beacon is still reporting and the map is moving on its own." },
      { label: "The numbers", body: "Distance, points and duration across the top update as new fixes arrive." },
      { label: "Story & downloads", body: "“Story” is a shareable recap. KML and GPX download the full track for Google Earth or your GPS." },
    ],
  },
};

export function SpectatorGuide({ variant = "event" }: { variant?: Variant }) {
  const cfg = COPY[variant];
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // First-visit auto-open, guarded so a returning spectator isn't nagged.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(cfg.key) === "1";
    } catch {
      /* private mode / blocked storage — treat as unseen, show once this load */
    }
    if (!seen) setOpen(true);
    setReady(true);
  }, [cfg.key]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(cfg.key, "1");
    } catch {
      /* ignore — worst case it shows again next visit */
    }
  }

  if (!ready) return null;

  return (
    <>
      {/* Re-open button — always present, bottom-left, out of the way of the
          Mapbox zoom/compass controls that live top-right. */}
      {!open && (
        <button
          type="button"
          aria-label="What am I looking at?"
          onClick={() => setOpen(true)}
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            zIndex: 20,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: theme.surface,
            color: theme.body,
            border: `1px solid ${theme.hairline}`,
            borderRadius: 20,
            padding: "8px 13px 8px 10px",
            font: `800 ${text.xs}px ${font.sans}`,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.4)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: theme.accent,
              color: theme.accentInk,
              font: `italic 700 12px Georgia, serif`,
              lineHeight: 1,
            }}
          >
            i
          </span>
          Guide
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={cfg.title}
          style={{
            position: "absolute",
            zIndex: 25,
            left: 14,
            bottom: 14,
            width: "min(360px, calc(100vw - 28px))",
            background: theme.surface,
            border: `1px solid ${theme.hairline}`,
            borderRadius: 12,
            boxShadow: "0 16px 44px rgba(0,0,0,.6)",
            overflow: "hidden",
            fontFamily: font.sans,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              padding: "14px 14px 10px",
              borderBottom: `1px solid ${theme.hairlineSoft}`,
            }}
          >
            <div>
              <div
                style={{
                  font: `800 ${text.xxs}px ${font.sans}`,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: theme.accent,
                  marginBottom: 4,
                }}
              >
                Waypoint · Live
              </div>
              <div style={{ font: `800 ${text.xl}px ${font.sans}`, color: theme.ink, lineHeight: 1.1 }}>
                {cfg.title}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close guide"
              onClick={dismiss}
              style={{
                flexShrink: 0,
                background: "transparent",
                border: "none",
                color: theme.muted,
                cursor: "pointer",
                font: `400 20px ${font.sans}`,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "12px 14px 6px" }}>
            <p style={{ margin: "0 0 12px", font: `${text.md}px/1.5 ${font.sans}`, color: theme.body }}>
              {cfg.lead}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {cfg.rows.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span
                    style={{
                      flexShrink: 0,
                      marginTop: 3,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: r.dot ?? "transparent",
                      border: r.dot ? `2px solid rgba(255,255,255,.85)` : `1px dashed ${theme.faint}`,
                      boxShadow: r.dot ? `0 0 0 3px ${hexA(r.dot, 0.22)}` : "none",
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ font: `800 ${text.sm}px ${font.sans}`, color: theme.ink }}>{r.label}. </span>
                    <span style={{ font: `${text.sm}px/1.5 ${font.sans}`, color: theme.body }}>{r.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 14px 14px" }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                width: "100%",
                background: theme.accent,
                color: theme.accentInk,
                border: "none",
                borderRadius: 6,
                padding: "11px 16px",
                font: `800 ${text.md}px ${font.sans}`,
                letterSpacing: 0.3,
                cursor: "pointer",
              }}
            >
              Got it — watch the map
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Hex (#RRGGBB) → rgba() with the given alpha, for soft status halos. */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default SpectatorGuide;
