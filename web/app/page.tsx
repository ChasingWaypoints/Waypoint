import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Waypoint — Live Event Tracking for Rally & Off-Road",
  description:
    "Every entrant's beacon on one live map. Garmin inReach, SPOT and ZOLEO, no app required. Google Earth Pro feeds for recovery teams, an embeddable map for your event site, and a roster you load in one CSV.",
  openGraph: {
    title: "Waypoint — Live Event Tracking for Rally & Off-Road",
    description: "Every entrant's beacon on one live map. No app required.",
    url: "/",
    type: "website",
  },
};

const C = {
  canvas: "#0A0A0A",
  surface: "#0C1E29",
  surfaceHi: "#14303F",
  hairline: "#1E3B4C",
  accent: "#FFFE15",
  accentInk: "#0C1E29",
  lime: "#CCFF00",
  track: "#CCFF00",
  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#7E93A0",
};

const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const PILLARS = [
  {
    title: "Every beacon, one map",
    body: "Entrants keep the trackers they already own. You add their Garmin MapShare link or SPOT feed to the roster and they appear on the map — no app to install, nothing for the rider to set up.",
  },
  {
    title: "Google Earth Pro for the recovery team",
    body: "Hand your safety crew a KML network link. It opens once and refreshes itself every thirty seconds. Every link is personal and every access is logged, so a leaked feed is traceable.",
  },
  {
    title: "Embed it on your own site",
    body: "One iframe puts the live map on your event website. Fans, families and sponsors follow along there. Nothing to maintain once the event starts.",
  },
];

const STEPS = [
  { n: "01", title: "Create the event", body: "Name it, set the dates, upload the route GPX if you have one." },
  { n: "02", title: "Load the roster", body: "A CSV with name, number, class and each entrant's beacon share link. Bad rows are flagged by line — the rest import." },
  { n: "03", title: "Share the links", body: "Embed code for your website, Google Earth Pro feeds for the crew, a private dashboard for you." },
];

const DEVICES = ["Garmin inReach", "SPOT", "ZOLEO"];

export default function LandingPage() {
  return (
    <main style={{ background: C.canvas, color: C.body, fontFamily: sans, minHeight: "100vh" }}>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 28px", borderBottom: `1px solid ${C.hairline}`, background: C.surface,
        }}
      >
        <Link href="/" style={{ color: C.ink, fontWeight: 800, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/auth/login" style={{ color: C.body, fontSize: 13, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            style={{ background: C.lime, color: C.accentInk, fontSize: 13, fontWeight: 800, textDecoration: "none", padding: "9px 18px", borderRadius: 4, letterSpacing: 0.3 }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <div style={{
        backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0.68) 55%, rgba(10,10,10,0.97) 100%), url(/hero.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center 28%",
      }}>
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "120px 28px 100px" }}>
        <div style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 20 }}>
          Live event tracking
        </div>
        <h1 style={{ color: C.ink, fontSize: "clamp(40px, 7vw, 76px)", lineHeight: 1.02, fontWeight: 800, letterSpacing: -1.5, margin: "0 0 26px", maxWidth: 860 }}>
          Every entrant.<br />
          <span style={{ color: C.accent }}>One live map.</span>
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.55, maxWidth: 620, margin: "0 0 36px", color: C.body }}>
          Built for rally raids, desert races and long-distance rides. Riders keep the satellite
          beacons they already carry. Organizers see all of them at once — and hand the recovery
          team a Google Earth Pro feed that just works.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/auth/signup"
            style={{ background: C.lime, color: C.accentInk, fontWeight: 800, fontSize: 15, padding: "14px 26px", borderRadius: 4, textDecoration: "none", letterSpacing: 0.2 }}
          >
            Start an event — free during beta
          </Link>
          <a
            href="#how"
            style={{ border: `1px solid ${C.hairline}`, color: C.ink, fontWeight: 600, fontSize: 15, padding: "14px 26px", borderRadius: 4, textDecoration: "none" }}
          >
            How it works
          </a>
        </div>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 44, alignItems: "center" }}>
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Works with</span>
          {DEVICES.map((d) => (
            <span key={d} style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>{d}</span>
          ))}
          <span style={{ color: C.muted, fontSize: 14 }}>· no app required</span>
        </div>
      </section>
      </div>

      {/* ── Map strip ────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, background: C.surface }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24 }}>
          {[
            ["Satellite imagery", "Esri World Imagery by default — the sharpest coverage over desert and mountain terrain. Switch to topo or streets in one click."],
            ["Measure anything", "Click-to-measure distances and bearings straight on the map, in kilometres or miles."],
            ["Status at a glance", "Live, stale or dark — colour-coded per entrant with the last fix time, on the map and in the roster."],
            ["Trails, not just dots", "Click any entrant to see where they have been. Export the whole event as KML afterwards."],
          ].map(([t, b]) => (
            <div key={t}>
              <div style={{ color: C.track, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>{t}</div>
              <div style={{ color: C.body, fontSize: 14, lineHeight: 1.5 }}>{b}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pillars ──────────────────────────────────────────── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "80px 28px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {PILLARS.map((p) => (
            <div key={p.title} style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 6, padding: 26 }}>
              <div style={{ width: 28, height: 4, background: C.accent, marginBottom: 18 }} />
              <h3 style={{ color: C.ink, fontSize: 19, fontWeight: 800, margin: "0 0 10px", letterSpacing: -0.2 }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.body }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how" style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 28px 80px" }}>
        <div style={{ color: C.accent, fontSize: 12, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 14 }}>
          For organizers
        </div>
        <h2 style={{ color: C.ink, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: -0.8, margin: "0 0 36px" }}>
          Three steps. Then you watch the race.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 28 }}>
          {STEPS.map((s) => (
            <div key={s.n}>
              <div style={{ color: C.accent, fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1, marginBottom: 14 }}>{s.n}</div>
              <h3 style={{ color: C.ink, fontSize: 17, fontWeight: 800, margin: "0 0 8px" }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: C.body }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section style={{ background: C.accent }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ color: C.accentInk, fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, letterSpacing: -0.6, margin: "0 0 8px" }}>
              Free while we&rsquo;re in beta.
            </h2>
            <p style={{ color: C.accentInk, opacity: 0.8, fontSize: 15, margin: 0 }}>
              Annual membership for riders and per-event pricing for organizers come after.
            </p>
          </div>
          <Link
            href="/auth/signup"
            style={{ background: C.accentInk, color: C.accent, fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 4, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Create an account
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: "28px", background: C.surface }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: 13, color: C.muted }}>
          <span>&copy; {new Date().getFullYear()} Waypoint &middot; a Chasing Waypoints product</span>
          <span style={{ color: C.body }}>We never sell your location data. Ever.</span>
        </div>
      </footer>
    </main>
  );
}
