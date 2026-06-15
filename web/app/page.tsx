import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Waypoint — GPS Tracking for Adventure Sports",
  description:
    "Track motorcycle tours, hikes, and off-road adventures in real time. Share live routes with a single link. Works with Garmin inReach, SPOT, ZOLEO, and phone GPS.",
  openGraph: {
    title: "Waypoint — GPS Tracking for Adventure Sports",
    description:
      "Track motorcycle tours, hikes, and off-road adventures in real time. Share live routes with a single link.",
    url: "/",
    type: "website",
  },
};

// Brand tokens — ChasingWaypoints palette
const C = {
  bgPrimary:   "#0b0f0a",
  bgCard:      "#131f12",
  bgSection:   "#0f170e",
  orange:      "#e8932a",
  green:       "#5ab876",
  white:       "#ffffff",
  muted:       "#7a9a7a",
  dimmed:      "#4a6a4a",
  border:      "rgba(255,255,255,0.07)",
};

const FEATURES = [
  {
    icon: "🛰️",
    title: "All Your Devices, One Map",
    body: "Garmin inReach, SPOT, ZOLEO, and your phone GPS — tracked together in real time. Switch between sources automatically.",
  },
  {
    icon: "📍",
    title: "Live Share Links",
    body: "Send a single link. Anyone can follow your route on a full-screen map, no account required. Password-protect it or set an expiry.",
  },
  {
    icon: "🗺️",
    title: "Export Anywhere",
    body: "Download your route as GPX for Garmin Basecamp, RideWithGPS, or Gaia GPS. Or KML for Google Earth Pro recovery teams.",
  },
  {
    icon: "⚡",
    title: "Smart Polling",
    body: "Phone GPS is primary. Satellite device kicks in automatically when your phone goes dark — no gaps in your track.",
  },
  {
    icon: "🔒",
    title: "Privacy Zones",
    body: "Define zones around your home or camp. Points inside are automatically masked before anyone else can see them.",
  },
  {
    icon: "🏁",
    title: "Rally Mode",
    body: "Import OpenRally GPX files. Waypoints, notes, and route stages — all on the same map as your live position.",
  },
];

const DEVICES = [
  { name: "Garmin inReach", models: "Mini 2 · Mini · Explorer+ · SE+", icon: "🛰️" },
  { name: "SPOT", models: "SPOT X · Gen4 · Trace", icon: "📡" },
  { name: "ZOLEO", models: "ZOLEO Satellite Communicator", icon: "🔵" },
  { name: "Phone GPS", models: "iOS · Android — no satellite required", icon: "📱" },
];

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 14 }}>
      <div style={{ width: 32, height: 3, background: C.orange, margin: "0 auto 10px" }} />
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.green, textTransform: "uppercase", margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPrimary, color: C.white }}>

      {/* Nav */}
      <nav style={{ background: C.bgPrimary, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        <span style={{ color: C.white, fontWeight: 900, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>
          Waypoint
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link
            href="/auth/login"
            style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase", padding: "8px 14px" }}
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            style={{ background: C.orange, color: C.white, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase", padding: "8px 18px" }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: C.bgPrimary, padding: "88px 24px 80px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 32, height: 3, background: C.orange, margin: "0 auto 14px" }} />
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.green, textTransform: "uppercase", margin: "0 0 20px" }}>
          Adventure GPS Tracking
        </p>
        <h1 style={{
          fontSize: "clamp(38px, 7vw, 68px)",
          fontWeight: 900,
          color: C.white,
          margin: "0 0 24px",
          lineHeight: 1.05,
          maxWidth: 760,
          marginLeft: "auto",
          marginRight: "auto",
          letterSpacing: "-0.5px",
        }}>
          Track every mile.<br />Share the journey.
        </h1>
        <p style={{ fontSize: 17, fontWeight: 300, color: C.muted, maxWidth: 520, margin: "0 auto 40px", lineHeight: 1.7 }}>
          One platform for motorcycle tours, overland adventures, and backcountry trips. Aggregate Garmin, SPOT, ZOLEO, and phone GPS into a single live map.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/signup"
            style={{ background: C.orange, color: C.white, fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "16px 40px", display: "inline-block" }}
          >
            Start Tracking Free
          </Link>
          <a
            href="#devices"
            style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "16px 36px", display: "inline-block" }}
          >
            See Devices
          </a>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 48, marginTop: 64, flexWrap: "wrap" }}>
          {[
            { value: "4", label: "Device Types" },
            { value: "Real-time", label: "Live Updates" },
            { value: "Free", label: "To Start" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: C.white }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.green, textTransform: "uppercase", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <EyebrowLabel>Built for Adventure</EyebrowLabel>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, textAlign: "center", color: C.white, marginBottom: 48, letterSpacing: "-0.3px" }}>
          Everything you need on the trail
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1, background: C.border, border: `1px solid ${C.border}` }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: C.bgCard, padding: "32px 28px", borderLeft: `3px solid ${C.orange}` }}>
              <span style={{ fontSize: 28 }}>{f.icon}</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.white, margin: "12px 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, fontWeight: 300, color: C.muted, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Device compatibility */}
      <section id="devices" style={{ background: C.bgSection, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px 24px" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          <EyebrowLabel>Device Support</EyebrowLabel>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, textAlign: "center", color: C.white, marginBottom: 48, letterSpacing: "-0.3px" }}>
            Works with what you already own
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 1, background: C.border, border: `1px solid ${C.border}` }}>
            {DEVICES.map((d) => (
              <div key={d.name} style={{ background: C.bgCard, padding: "28px 24px" }}>
                <span style={{ fontSize: 32 }}>{d.icon}</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: C.white, margin: "12px 0 4px" }}>{d.name}</h3>
                <p style={{ fontSize: 12, fontWeight: 300, color: C.muted, margin: 0, lineHeight: 1.5 }}>{d.models}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "80px 24px", maxWidth: 840, margin: "0 auto" }}>
        <EyebrowLabel>Simple Setup</EyebrowLabel>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, textAlign: "center", color: C.white, marginBottom: 56, letterSpacing: "-0.3px" }}>
          Tracking in 3 steps
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 40 }}>
          {[
            { num: "01", title: "Create an account", body: "Sign up free. No credit card, no satellite plan required to get started." },
            { num: "02", title: "Connect your device", body: "Link your Garmin, SPOT, or ZOLEO in Settings. Or just use phone GPS — it's always available." },
            { num: "03", title: "Start a trip", body: "Hit Start, then share the link with whoever needs to follow along. That's it." },
          ].map((step) => (
            <div key={step.num}>
              <div style={{ fontSize: 40, fontWeight: 900, color: C.orange, marginBottom: 14, lineHeight: 1 }}>{step.num}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.white, margin: "0 0 8px" }}>{step.title}</h3>
              <p style={{ fontSize: 14, fontWeight: 300, color: C.muted, lineHeight: 1.6, margin: 0 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Beta / Download */}
      <section style={{ background: C.bgSection, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 56, alignItems: "center", justifyContent: "center" }}>
          {/* QR code */}
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=exp://u.expo.dev/9616d6e2-8935-452e-b7a2-bdc08f95b845&color=ffffff&bgcolor=131f12`}
              alt="Scan to open in Expo Go"
              width={180}
              height={180}
              style={{ border: `1px solid ${C.border}` }}
            />
            <p style={{ fontSize: 11, color: C.dimmed, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", margin: "12px 0 0" }}>
              Scan with Expo Go
            </p>
          </div>

          {/* Text */}
          <div style={{ maxWidth: 440 }}>
            <div style={{ width: 32, height: 3, background: C.orange, marginBottom: 14 }} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.green, textTransform: "uppercase", margin: "0 0 10px" }}>
              Beta — Free Early Access
            </p>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 900, color: C.white, margin: "0 0 16px", lineHeight: 1.2, letterSpacing: "-0.3px" }}>
              Try the app now — no invite needed
            </h2>
            <p style={{ fontSize: 15, color: C.muted, fontWeight: 300, lineHeight: 1.7, margin: "0 0 24px" }}>
              Download <strong style={{ color: C.white }}>Expo Go</strong> on iOS or Android, then scan the QR code to launch Waypoint instantly — no App Store approval, no waiting.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="https://apps.apple.com/app/expo-go/id982107779"
                target="_blank" rel="noopener noreferrer"
                style={{ background: C.bgCard, color: C.white, border: `1px solid ${C.border}`, padding: "12px 20px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", display: "inline-block" }}
              >
                Expo Go — iOS
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=host.exp.exponent"
                target="_blank" rel="noopener noreferrer"
                style={{ background: C.bgCard, color: C.white, border: `1px solid ${C.border}`, padding: "12px 20px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", display: "inline-block" }}
              >
                Expo Go — Android
              </a>
            </div>
            <p style={{ fontSize: 12, color: C.dimmed, fontWeight: 300, margin: "16px 0 0" }}>
              Native App Store builds coming soon. Your data carries over.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ background: C.bgPrimary, padding: "88px 24px", textAlign: "center" }}>
        <div style={{ width: 32, height: 3, background: C.orange, margin: "0 auto 14px" }} />
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.green, textTransform: "uppercase", margin: "0 0 20px" }}>
          Chasing Waypoints
        </p>
        <h2 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, color: C.white, margin: "0 0 16px", letterSpacing: "-0.3px" }}>
          Ready for your next adventure?
        </h2>
        <p style={{ fontSize: 16, fontWeight: 300, color: C.muted, margin: "0 0 36px" }}>
          Free to start. No hardware required.
        </p>
        <Link
          href="/auth/signup"
          style={{ background: C.orange, color: C.white, fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "18px 44px", display: "inline-block" }}
        >
          Create Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ background: C.bgPrimary, borderTop: `1px solid ${C.border}`, padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 300, color: C.dimmed, margin: 0 }}>
          © {new Date().getFullYear()} Waypoint · A Chasing Waypoints project · We never sell your location data. Ever.
        </p>
      </footer>

    </div>
  );
}
