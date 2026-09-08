import { text } from "../../lib/theme";
import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

export const metadata: Metadata = {
  title: "How it works — Waypoint",
  description:
    "How Waypoint works for organizers and riders: create an event, load a roster of beacons, share a live map and Google Earth Pro recovery feed, and let riders join by code with emergency info.",
  openGraph: {
    title: "How Waypoint works",
    description: "Every entrant's beacon on one live map — for organizers and riders.",
    url: "/how-it-works",
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
  ink: "#FFFFFF",
  body: "#C8D4DC",
  muted: "#7E93A0",
};
const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure style={{ margin: "0 0 8px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", display: "block", borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.surface }}
      />
      <figcaption style={{ color: C.muted, fontSize: text.sm, marginTop: 10, textAlign: "center" }}>{caption}</figcaption>
    </figure>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 auto", color: C.accent, fontSize: text.md, fontWeight: 800, fontVariantNumeric: "tabular-nums", width: 30 }}>{n}</div>
      <div>
        <div style={{ color: C.ink, fontWeight: 700, fontSize: text.lg, marginBottom: 4 }}>{title}</div>
        <p style={{ color: C.body, fontSize: text.base, lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = { color: C.accent, fontSize: text.xs, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 };
const h2: React.CSSProperties = { color: C.ink, fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: -0.5, margin: "0 0 10px" };
const lead: React.CSSProperties = { color: C.body, fontSize: 17, lineHeight: 1.6, margin: "0 0 28px", maxWidth: 620 };

export default function HowItWorksPage() {
  return (
    <main style={{ background: C.canvas, color: C.body, fontFamily: sans, minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", borderBottom: `1px solid ${C.hairline}`, background: C.surface }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.ink, fontWeight: 800, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none" }}><LogoMark size={22} />Waypoint</Link>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
          <Link href="/guide" style={{ color: C.body, fontSize: text.base, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>Guide</Link>
          <Link href="/pricing" style={{ color: C.body, fontSize: text.base, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>Pricing</Link>
          <Link href="/auth/login" style={{ color: C.body, fontSize: text.base, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>Sign in</Link>
          <Link href="/auth/signup" style={{ background: C.lime, color: C.accentInk, fontSize: text.base, fontWeight: 800, textDecoration: "none", padding: "9px 18px", borderRadius: 4, letterSpacing: 0.3 }}>Get started</Link>
        </div>
      </nav>

      {/* Header */}
      <header style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 28px 40px" }}>
        <div style={eyebrow}>The guide</div>
        <h1 style={{ color: C.ink, fontSize: "clamp(34px, 6vw, 60px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: -1, margin: "0 0 20px", maxWidth: 820 }}>
          Every entrant&rsquo;s beacon on <span style={{ color: C.accent }}>one live map</span>.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.55, maxWidth: 660, margin: 0, color: C.body }}>
          Waypoint pulls the satellite trackers your riders already carry — Garmin inReach, SPOT, ZOLEO — onto a single map you can watch, share, and hand to your recovery team. Here&rsquo;s how it works, for organizers and for riders.
        </p>
      </header>

      {/* Hero shot */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "0 28px 20px" }}>
        <Shot src="/screenshots/live-map.jpg" alt="Waypoint live tracking map with every rider on satellite imagery" caption="The live map — every entrant, colour-coded by class, on satellite imagery with last-seen times." />
      </section>

      {/* For organizers */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, marginTop: 40 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 28px" }}>
          <div style={eyebrow}>For organizers</div>
          <h2 style={h2}>Run the whole event from one dashboard</h2>
          <p style={lead}>Create an event, load your roster, and Waypoint does the rest — polling every beacon every couple of minutes and putting them on a map you control.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 40, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <Step n="01" title="Create the event" body="Name it, set the start and end dates, and pick how it runs — a free group ride, an event you pay for, or one where riders pay a small fee when they join." />
              <Step n="02" title="Load the roster" body="Upload a CSV with each entrant's name, number, class and their beacon share link (Garmin MapShare, SPOT or ZOLEO). Bad rows are flagged by line; the rest import." />
              <Step n="03" title="Watch the live map" body="Every beacon refreshes automatically. Filter by class, search a rider, measure distances, and see who's gone quiet at a glance with live / stale / dark status." />
              <Step n="04" title="Share it" body="An embed code for your event website, a private Google Earth Pro feed for the recovery crew, and per-rider registration links — all from the Share tab." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <Shot src="/screenshots/dashboard.jpg" alt="Waypoint organizer dashboard listing events" caption="Your events, in one place — create, manage, and open the live map for each." />
              <Shot src="/screenshots/share-embed.jpg" alt="Share tab with website embed code and Google Earth Pro recovery feed" caption="Share tab: an iframe for your site, and personal Google Earth Pro links for the recovery team — every access logged." />
            </div>
          </div>
        </div>
      </section>

      {/* For riders */}
      <section>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 28px" }}>
          <div style={eyebrow}>For riders</div>
          <h2 style={h2}>Join in under a minute</h2>
          <p style={lead}>No app to install. An organizer shares a join code or link; you register once and you&rsquo;re on the map.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 40, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <Step n="01" title="Enter the join code" body="Got a code from your organizer? Drop it in and you're taken straight to that event's registration." />
              <Step n="02" title="Add your details" body="Your name, rider number and class. Optionally add emergency contact and medical info — shared only with the organizer and responders, and never shown on the public map." />
              <Step n="03" title="Track your ride" body="Bring your own satellite beacon — Garmin inReach, SPOT or ZOLEO — for real backcountry coverage. Cellular tracking through the RallyTrak companion apps is coming soon. Your position joins the live map for the event." />
            </div>
            <div>
              <Shot src="/screenshots/rider-join.jpg" alt="Rider registration form with emergency info fields" caption="Register with your details and optional emergency info — with explicit consent, kept off the public map." />
            </div>
          </div>

          <div style={{ marginTop: 28, background: C.surfaceHi, border: `1px solid ${C.hairline}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 6, padding: "14px 18px", maxWidth: 720 }}>
            <p style={{ margin: 0, color: C.body, fontSize: text.base, lineHeight: 1.6 }}>
              <strong style={{ color: C.ink }}>A note on safety.</strong> Waypoint adds visibility to the systems you already use. It is a tool for recreation, not a replacement for a dedicated emergency locator beacon or for real-world preparation and backup planning. Always carry and use proper emergency equipment.
            </p>
          </div>
        </div>
      </section>

      {/* For everyone watching */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.hairline}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 28px" }}>
          <div style={eyebrow}>For everyone watching</div>
          <h2 style={h2}>A live map you can put anywhere</h2>
          <p style={lead}>Fans, families and sponsors follow along on a full-screen map — on your own event site under your branding, with a &ldquo;powered by Waypoint&rdquo; credit. Emergency and SOS details are never shown publicly.</p>
          <Shot src="/screenshots/public-event.jpg" alt="Public branded event page with organizer logo and live map" caption="The public event page — your logo and colours, the live roster, and the map. Embed the same view on your website in one line." />
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 28px", textAlign: "center" }}>
        <h2 style={{ ...h2, marginBottom: 14 }}>Ready to put your event on the map?</h2>
        <p style={{ color: C.muted, fontSize: 16, margin: "0 0 28px" }}>Free to start. No hardware to buy — riders keep the beacons they already own.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/signup" style={{ background: C.lime, color: C.accentInk, fontWeight: 800, fontSize: text.lg, padding: "14px 28px", borderRadius: 4, textDecoration: "none", letterSpacing: 0.2 }}>Create your event</Link>
          <Link href="/" style={{ border: `1px solid ${C.hairline}`, color: C.ink, fontWeight: 600, fontSize: text.lg, padding: "14px 28px", borderRadius: 4, textDecoration: "none" }}>Back to home</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: "28px", background: C.surface }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: text.base, color: C.muted }}>
          <span>&copy; {new Date().getFullYear()} Waypoint &middot; a Chasing Waypoints product</span>
          <span style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/pricing" style={{ color: C.muted, textDecoration: "none" }}>Pricing</Link>
            <Link href="/terms" style={{ color: C.muted, textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "none" }}>Privacy</Link>
            <span style={{ color: C.body }}>We never sell your location data. Ever.</span>
          </span>
        </div>
      </footer>
    </main>
  );
}
