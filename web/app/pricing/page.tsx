"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SiteNav } from "@/components/SiteNav";

/**
 * Public pricing page — the single source of truth for the five tiers, wired
 * to real checkout. $15 / $29 start Stripe subscription checkout; Event routes
 * to event creation; Org starts the $3,500 org checkout. Logged-out visitors
 * are sent to sign up first and returned to where they were headed.
 */

const C = {
  canvas: "#0A0A0A",
  surface: "#0C1E29",
  surfaceHi: "#14303F",
  hairline: "#1E3B4C",
  accent: "#FFFE15",
  accentInk: "#0C1E29",
  lime: "#CCFF00",
  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#8598A5",
};
const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

type CTA =
  | { kind: "signup" }
  | { kind: "subscribe"; plan: "individual" | "individual_plus" }
  | { kind: "event" }
  | { kind: "org" };

interface Tier {
  name: string;
  price: string;
  per: string;
  tag: string;
  accent: string;
  builds: string | null;
  featured?: boolean;
  cta: { label: string; action: CTA };
  feats: string[];
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    tag: "Ride & share.",
    accent: "#5B6E7A",
    builds: null,
    cta: { label: "Create account", action: { kind: "signup" } },
    feats: [
      "Live tracking from the beacon you already own — Garmin inReach, SPOT, ZOLEO",
      "Share your live ride with family & friends — just a link, no app to install",
      "Start a group ride — up to 10 riders on one live map",
      "Join any event with a code",
      "Emergency ICE card with QR",
    ],
  },
  {
    name: "Individual",
    price: "$15",
    per: "/ year",
    tag: "For the rider who’s always out there.",
    accent: "#1FE0A0",
    builds: "Free",
    cta: { label: "Get Individual", action: { kind: "subscribe", plan: "individual" } },
    feats: [
      "Unlimited ride history — every trip kept, not just the last 30 days",
      "Shareable trip stories — a replay link of any ride",
      "Privacy zones — hide your home or start point",
      "Priority in the RallyTrak cellular tracking apps",
    ],
  },
  {
    name: "Individual Plus",
    price: "$29",
    per: "/ year",
    tag: "For the rider who wants the full picture.",
    accent: "#3AD1FF",
    builds: "Individual",
    featured: true,
    cta: { label: "Get Plus", action: { kind: "subscribe", plan: "individual_plus" } },
    feats: [
      "Live weather & radar overlaid on your map",
      "Radar timelapse — watch the storm cell move before you ride into it",
      "Custom share page — your name & photo, no Waypoint branding",
      "Priority support — a real person, fast",
    ],
  },
  {
    name: "Event",
    price: "$200",
    per: "/ event",
    tag: "Run a real event.",
    accent: "#CCFF00",
    builds: "Individual Plus",
    cta: { label: "Create an event", action: { kind: "event" } },
    feats: [
      "40 rider seats (then +$40 per 10) — or let riders pay to join ($10–$15 each)",
      "Command view — a live recovery & race-control map",
      "Google Earth Pro recovery feed — logged, revocable credentials",
      "Embed the live map on your own website",
      "Make it private — no public page, seen only by your team",
    ],
  },
  {
    name: "Org / Series",
    price: "$3,500",
    per: "/ year",
    tag: "For promoters & teams running many events.",
    accent: "#FFFE15",
    builds: "Event",
    cta: { label: "Get Org", action: { kind: "org" } },
    feats: [
      "1,500-rider pool across unlimited events",
      "White-label — your logo & colors on every map and embed",
      "Every event can be private",
      "Priority support",
    ],
  },
];

export default function PricingPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(tierName: string, action: CTA) {
    setErr(null);
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    // Where an unauthenticated visitor should land after signing up.
    const nextFor: Record<string, string> = {
      signup: "/dashboard",
      subscribe: "/pricing",
      event: "/dashboard/events/create",
      org: "/pricing",
    };

    if (action.kind === "signup") { window.location.href = "/auth/signup"; return; }

    if (!session) {
      window.location.href = `/auth/signup?next=${encodeURIComponent(nextFor[action.kind])}`;
      return;
    }

    if (action.kind === "event") { window.location.href = "/dashboard/events/create"; return; }

    // subscribe / org → Stripe checkout
    setBusy(tierName);
    const endpoint = action.kind === "org" ? "/api/billing/org-checkout" : "/api/billing/subscribe";
    const body = action.kind === "subscribe" ? JSON.stringify({ plan: action.plan }) : "{}";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) { window.location.href = data.url; return; }
      setErr(data.error ?? "Could not start checkout. Please try again.");
    } catch {
      setErr("Network error starting checkout. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ background: C.canvas, color: C.body, fontFamily: sans, minHeight: "100vh" }}>
      {/* Nav */}
      <SiteNav />

      {/* Header */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 28px 24px", textAlign: "center" }}>
        <div style={{ color: C.lime, fontSize: 12, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 14 }}>Pricing</div>
        <h1 style={{ color: C.ink, fontSize: "clamp(30px, 5vw, 46px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: -1, margin: "0 0 14px" }}>
          One live map.<br />Priced to grow with you.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 620, margin: "0 auto", color: C.body }}>
          Start free. Each tier includes everything below it, plus more. Riders keep the satellite beacons they already own.
        </p>
      </section>

      {err && (
        <div style={{ maxWidth: 720, margin: "0 auto 8px", padding: "10px 16px", background: "#2A1214", border: "1px solid #5A2530", color: "#FF9B9B", borderRadius: 6, fontSize: 14, textAlign: "center" }}>{err}</div>
      )}

      {/* Ladder */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 28px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
        {TIERS.map((t) => (
          <div
            key={t.name}
            style={{
              background: C.surface,
              border: `1px solid ${t.featured ? t.accent : C.hairline}`,
              borderLeft: `4px solid ${t.accent}`,
              borderRadius: 10,
              padding: "22px 24px",
              boxShadow: t.featured ? `0 0 0 1px ${t.accent}22, 0 8px 30px rgba(0,0,0,.3)` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 340px", minWidth: 260 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ color: C.ink, fontSize: 21, fontWeight: 800, letterSpacing: -0.3, margin: 0 }}>{t.name}</h2>
                  {t.featured && (
                    <span style={{ background: t.accent, color: C.accentInk, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", padding: "3px 8px", borderRadius: 100 }}>Most popular</span>
                  )}
                </div>
                <div style={{ color: C.muted, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{t.tag}</div>
                <div style={{ color: C.body, fontSize: 13, fontWeight: 700, margin: "12px 0 10px" }}>
                  {t.builds
                    ? <>Everything in <span style={{ color: C.ink }}>{t.builds}</span>, plus:</>
                    : <span style={{ color: C.muted, fontWeight: 600 }}>The place to start — free, forever.</span>}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr", gap: 7 }}>
                  {t.feats.map((f, i) => (
                    <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 14, lineHeight: 1.4, color: C.body }}>
                      <span style={{ color: t.accent, fontWeight: 800, flexShrink: 0, fontSize: 12, lineHeight: 1.5 }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 170 }}>
                <div style={{ whiteSpace: "nowrap" }}>
                  <span style={{ color: t.accent, fontSize: 32, fontWeight: 800 }}>{t.price}</span>
                  <span style={{ color: C.muted, fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{t.per}</span>
                </div>
                <button
                  onClick={() => run(t.name, t.cta.action)}
                  disabled={busy === t.name}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    background: t.featured ? t.accent : (t.name === "Free" ? "transparent" : C.lime),
                    color: t.featured ? C.accentInk : (t.name === "Free" ? C.body : C.accentInk),
                    border: t.name === "Free" ? `1px solid ${C.hairline}` : "none",
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: 0.3,
                    padding: "12px 18px",
                    borderRadius: 6,
                    cursor: busy === t.name ? "default" : "pointer",
                    opacity: busy === t.name ? 0.7 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {busy === t.name ? "Starting…" : t.cta.label}
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Entrant-paid note */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "8px 28px 8px" }}>
        <div style={{ background: C.surfaceHi, border: `1px solid ${C.hairline}`, borderRadius: 8, padding: "14px 18px", fontSize: 13, color: C.body, lineHeight: 1.5 }}>
          <strong style={{ color: C.ink }}>Prefer riders to pay their own way?</strong> On any event you can switch to entrant-paid — each rider pays a small fee at registration, set by event length: up to 3 days <strong style={{ color: C.ink }}>$10</strong> · up to 7 days <strong style={{ color: C.ink }}>$12</strong> · up to 30 days <strong style={{ color: C.ink }}>$15</strong> per rider. Event & Org tiers include the personal features above for the organizer’s own account.
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: "28px", background: C.surface, marginTop: 32 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 14, color: C.muted }}>
          <span>&copy; {new Date().getFullYear()} Waypoint &middot; a Chasing Waypoints product</span>
          <span style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/how-it-works" style={{ color: C.muted, textDecoration: "none" }}>How it works</Link>
            <Link href="/guide" style={{ color: C.muted, textDecoration: "none" }}>Guide</Link>
            <Link href="/terms" style={{ color: C.muted, textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "none" }}>Privacy</Link>
            <span style={{ color: C.body }}>We never sell your location data. Ever.</span>
          </span>
        </div>
      </footer>
    </main>
  );
}
