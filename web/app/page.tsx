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

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", color: "#262626" }}>

      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase" }}>
          Waypoint
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/auth/login"
            style={{ color: "#bbbbbb", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase", padding: "8px 14px" }}
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            style={{ background: "#1c69d4", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase", padding: "8px 16px" }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: "#1a2129", padding: "80px 24px 72px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#1c69d4", textTransform: "uppercase", margin: "0 0 16px" }}>
          Adventure GPS Tracking
        </p>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 700, color: "#ffffff", margin: "0 0 20px", lineHeight: 1.1, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
          Track every mile.<br />Share the journey.
        </h1>
        <p style={{ fontSize: 17, fontWeight: 300, color: "#8a9ab0", maxWidth: 540, margin: "0 auto 36px", lineHeight: 1.6 }}>
          One platform for motorcycle tours, overland adventures, and backcountry trips. Aggregate Garmin, SPOT, ZOLEO, and phone GPS into a single live map.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/signup"
            style={{ background: "#1c69d4", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "16px 36px", display: "inline-block" }}
          >
            Start Tracking Free
          </Link>
          <a
            href="#devices"
            style={{ background: "transparent", color: "#bbbbbb", border: "1px solid #3a4550", fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "16px 36px", display: "inline-block" }}
          >
            See Devices
          </a>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "40px", marginTop: 56, flexWrap: "wrap" }}>
          {[
            { value: "4", label: "Device Types" },
            { value: "Real-time", label: "Live Updates" },
            { value: "Free", label: "To Start" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#6b7a8d", textTransform: "uppercase", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "72px 24px", maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#1c69d4", textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
          Built for Adventure
        </p>
        <h2 style={{ fontSize: 32, fontWeight: 700, textAlign: "center", color: "#1a2129", marginBottom: 48 }}>
          Everything you need on the trail
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: "#fff", padding: "32px 28px" }}>
              <span style={{ fontSize: 28 }}>{f.icon}</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a2129", margin: "12px 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, fontWeight: 300, color: "#6b6b6b", lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Device compatibility */}
      <section id="devices" style={{ background: "#f7f7f7", padding: "72px 24px" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#1c69d4", textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
            Device Support
          </p>
          <h2 style={{ fontSize: 32, fontWeight: 700, textAlign: "center", color: "#1a2129", marginBottom: 48 }}>
            Works with what you already own
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 1, background: "#e6e6e6", border: "1px solid #e6e6e6" }}>
            {DEVICES.map((d) => (
              <div key={d.name} style={{ background: "#fff", padding: "28px 24px" }}>
                <span style={{ fontSize: 32 }}>{d.icon}</span>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a2129", margin: "12px 0 4px" }}>{d.name}</h3>
                <p style={{ fontSize: 12, fontWeight: 300, color: "#9a9a9a", margin: 0, lineHeight: 1.5 }}>{d.models}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "72px 24px", maxWidth: 840, margin: "0 auto" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#1c69d4", textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
          Simple Setup
        </p>
        <h2 style={{ fontSize: 32, fontWeight: 700, textAlign: "center", color: "#1a2129", marginBottom: 48 }}>
          Tracking in 3 steps
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 40 }}>
          {[
            { num: "01", title: "Create an account", body: "Sign up free. No credit card, no satellite plan required to get started." },
            { num: "02", title: "Connect your device", body: "Link your Garmin, SPOT, or ZOLEO in Settings. Or just use phone GPS — it's always available." },
            { num: "03", title: "Start a trip", body: "Hit Start, then share the link with whoever needs to follow along. That's it." },
          ].map((step) => (
            <div key={step.num}>
              <div style={{ fontSize: 36, fontWeight: 700, color: "#1c69d4", marginBottom: 12 }}>{step.num}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a2129", margin: "0 0 8px" }}>{step.title}</h3>
              <p style={{ fontSize: 14, fontWeight: 300, color: "#6b6b6b", lineHeight: 1.6, margin: 0 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#1a2129", padding: "72px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>
          Ready for your next adventure?
        </h2>
        <p style={{ fontSize: 16, fontWeight: 300, color: "#8a9ab0", margin: "0 0 32px" }}>
          Free to start. No hardware required.
        </p>
        <Link
          href="/auth/signup"
          style={{ background: "#1c69d4", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textDecoration: "none", textTransform: "uppercase", padding: "16px 40px", display: "inline-block" }}
        >
          Create Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ background: "#1a2129", borderTop: "1px solid #2a3340", padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 300, color: "#4a5568", margin: 0 }}>
          © {new Date().getFullYear()} Waypoint · We never sell your location data. Ever.
        </p>
      </footer>

    </div>
  );
}
