import { text } from "../../lib/theme";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Field manual — Waypoint",
  description:
    "The complete Waypoint manual for organizers and riders: create an event, load a roster by CSV, set up Garmin inReach, SPOT and ZOLEO beacons, read the live map, run Command and SOS, share to a website and Google Earth Pro, and join an event as a rider.",
  openGraph: {
    title: "Waypoint field manual",
    description: "Step-by-step guide for organizers and riders.",
    url: "/guide",
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
  amber: "#FFB020",
  red: "#FF5C5C",
  grey: "#5B6E7A",
};
const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ── little building blocks ─────────────────────────────────── */

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  tint,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <section
      id={id}
      style={{
        background: tint ? C.surface : "transparent",
        borderTop: tint ? `1px solid ${C.hairline}` : "none",
        borderBottom: tint ? `1px solid ${C.hairline}` : "none",
        scrollMarginTop: 20,
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 28px" }}>
        {eyebrow ? <div style={eyebrowStyle}>{eyebrow}</div> : null}
        <h2 style={h2}>{title}</h2>
        {lead ? <p style={leadStyle}>{lead}</p> : null}
        {children}
      </div>
    </section>
  );
}

function Sub({ children }: { children: string }) {
  return (
    <h3
      style={{
        color: C.ink,
        fontSize: text.xl,
        fontWeight: 800,
        letterSpacing: -0.2,
        margin: "36px 0 12px",
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: C.body, fontSize: 15, lineHeight: 1.65, margin: "0 0 14px" }}>{children}</p>;
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, margin: "18px 0 6px" }}>
      {items.map(([title, body], i) => (
        <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            style={{
              flex: "0 0 auto",
              width: 28,
              height: 28,
              borderRadius: 999,
              background: C.surfaceHi,
              border: `1px solid ${C.hairline}`,
              color: C.accent,
              fontWeight: 800,
              fontSize: text.base,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {i + 1}
          </div>
          <div style={{ paddingTop: 2 }}>
            <div style={{ color: C.ink, fontWeight: 700, fontSize: text.lg, marginBottom: 3 }}>{title}</div>
            <div style={{ color: C.body, fontSize: 15, lineHeight: 1.6 }}>{body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Callout({ tone = "info", title, body }: { tone?: "info" | "warn"; title: string; body: string }) {
  const bar = tone === "warn" ? C.amber : C.accent;
  return (
    <div
      style={{
        margin: "20px 0",
        background: C.surfaceHi,
        border: `1px solid ${C.hairline}`,
        borderLeft: `3px solid ${bar}`,
        borderRadius: 6,
        padding: "14px 18px",
      }}
    >
      <div style={{ color: C.ink, fontWeight: 800, fontSize: text.md, marginBottom: 4 }}>{title}</div>
      <div style={{ color: C.body, fontSize: text.md, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Table({ head, rows, mono0 }: { head: string[]; rows: string[][]; mono0?: boolean }) {
  return (
    <div style={{ overflowX: "auto", margin: "18px 0" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520, fontSize: text.md }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  color: C.muted,
                  fontSize: text.xs,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  padding: "10px 14px",
                  borderBottom: `1px solid ${C.hairline}`,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    color: ci === 0 ? C.ink : C.body,
                    fontFamily: mono0 && ci === 0 ? mono : sans,
                    fontWeight: ci === 0 ? 700 : 400,
                    fontSize: mono0 && ci === 0 ? text.base : text.md,
                    lineHeight: 1.5,
                    padding: "10px 14px",
                    borderBottom: `1px solid ${C.hairline}`,
                    verticalAlign: "top",
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusLegend() {
  const rows: [string, string, string][] = [
    [C.lime, "Live", "A fix in the last 15 minutes. The rider is reporting normally."],
    [C.amber, "Stale", "Last fix 15–60 minutes ago. Often just terrain or a sky-blocked beacon — not an alarm on its own."],
    [C.red, "No signal", "Over 60 minutes with no fix. Worth a look, especially late in a stage."],
    [C.grey, "No fix yet", "The beacon has never reported to this event. Usually a setup issue — see troubleshooting."],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "18px 0" }}>
      {rows.map(([col, label, desc]) => (
        <div key={label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            style={{
              flex: "0 0 auto",
              marginTop: 5,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: col,
              boxShadow: `0 0 0 3px ${col}22`,
            }}
          />
          <div>
            <span style={{ color: C.ink, fontWeight: 800, fontSize: text.md }}>{label}</span>
            <span style={{ color: C.body, fontSize: text.md }}> — {desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code
      style={{
        fontFamily: mono,
        fontSize: text.base,
        background: C.surfaceHi,
        border: `1px solid ${C.hairline}`,
        borderRadius: 4,
        padding: "1px 6px",
        color: C.ink,
      }}
    >
      {children}
    </code>
  );
}

const eyebrowStyle: React.CSSProperties = {
  color: C.accent,
  fontSize: text.xs,
  fontWeight: 800,
  letterSpacing: 2,
  textTransform: "uppercase",
  marginBottom: 12,
};
const h2: React.CSSProperties = {
  color: C.ink,
  fontSize: "clamp(24px, 4vw, 34px)",
  fontWeight: 800,
  letterSpacing: -0.5,
  margin: "0 0 10px",
};
const leadStyle: React.CSSProperties = {
  color: C.body,
  fontSize: 16.5,
  lineHeight: 1.6,
  margin: "0 0 8px",
};

/* ── table-of-contents data ─────────────────────────────────── */

const TOC: { group: string; links: [string, string][] }[] = [
  {
    group: "For organizers",
    links: [
      ["#o-account", "1. Create your account"],
      ["#o-event", "2. Create an event"],
      ["#o-roster", "3. Build your roster"],
      ["#o-csv", "4. Import a roster by CSV"],
      ["#o-polling", "5. How tracking updates"],
      ["#o-map", "6. Read the live map"],
      ["#o-command", "7. Command view & SOS"],
      ["#o-share", "8. Share your event"],
      ["#o-brand", "9. Branding & white-label"],
      ["#o-pricing", "10. Pricing & billing"],
    ],
  },
  {
    group: "For riders",
    links: [
      ["#r-join", "1. Join an event"],
      ["#r-register", "2. Register & emergency info"],
      ["#r-beacon", "3. Connect your tracker"],
      ["#r-garmin", "  · Garmin inReach"],
      ["#r-spot", "  · SPOT"],
      ["#r-zoleo", "  · ZOLEO"],
      ["#r-phone", "  · Phone tracking"],
      ["#r-watch", "4. What you'll see"],
    ],
  },
  {
    group: "Reference",
    links: [
      ["#ref-status", "Status colours"],
      ["#ref-trouble", "Troubleshooting"],
      ["#ref-faq", "Quick FAQ"],
    ],
  },
];

/* ── page ───────────────────────────────────────────────────── */

export default function GuidePage() {
  return (
    <main style={{ background: C.canvas, color: C.body, fontFamily: sans, minHeight: "100vh" }}>
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          borderBottom: `1px solid ${C.hairline}`,
          background: C.surface,
        }}
      >
        <Link href="/" style={{ color: C.ink, fontWeight: 800, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/how-it-works" style={{ color: C.body, fontSize: text.base, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>
            How it works
          </Link>
          <Link href="/auth/login" style={{ color: C.body, fontSize: text.base, fontWeight: 600, textDecoration: "none", padding: "9px 14px" }}>
            Sign in
          </Link>
          <Link href="/auth/signup" style={{ background: C.lime, color: C.accentInk, fontSize: text.base, fontWeight: 800, textDecoration: "none", padding: "9px 18px", borderRadius: 4, letterSpacing: 0.3 }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Header */}
      <header style={{ maxWidth: 860, margin: "0 auto", padding: "64px 28px 8px" }}>
        <div style={eyebrowStyle}>Field manual</div>
        <h1 style={{ color: C.ink, fontSize: "clamp(32px, 6vw, 52px)", lineHeight: 1.06, fontWeight: 800, letterSpacing: -1, margin: "0 0 18px" }}>
          Everything you need to run — or ride — a tracked event.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 640, margin: 0, color: C.body }}>
          A complete, step-by-step reference for Waypoint. Organizers start on the left; riders can skip straight to{" "}
          <Link href="#r-join" style={{ color: C.accent, textDecoration: "none" }}>joining an event</Link>. Prefer the short
          version? Read <Link href="/how-it-works" style={{ color: C.accent, textDecoration: "none" }}>How it works</Link> first.
        </p>
      </header>

      {/* Table of contents */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "28px 28px 8px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 24,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            borderRadius: 10,
            padding: "24px 26px",
          }}
        >
          {TOC.map((col) => (
            <div key={col.group}>
              <div style={{ ...eyebrowStyle, marginBottom: 12 }}>{col.group}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.links.map(([href, label]) => (
                  <Link key={href} href={href} style={{ color: C.body, fontSize: text.md, textDecoration: "none", lineHeight: 1.4, whiteSpace: "pre" }}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ ORGANIZERS ══════════ */}

      <Section id="o-account" eyebrow="For organizers · 1" title="Create your account">
        <P>
          Go to <Link href="/auth/signup" style={linkS}>Sign up</Link> and create an account with your email. That&rsquo;s the only
          account anyone needs — your riders never have to sign up unless they want to. Once you&rsquo;re in, you land on your{" "}
          <strong style={strong}>dashboard</strong>, which lists every event you run and the button to create a new one.
        </P>
        <P>
          There&rsquo;s no hardware to buy and nothing to install. Waypoint reads the satellite beacons your riders already
          carry, so all of your setup happens right here in the browser.
        </P>
      </Section>

      <Section id="o-event" eyebrow="For organizers · 2" title="Create an event" tint>
        <P>
          From the dashboard, choose <strong style={strong}>Create event</strong>. You&rsquo;ll set a few things:
        </P>
        <Steps
          items={[
            ["Name and dates", "Give the event a name and set its start and end dates. The dates matter for entrant-paid events — the per-rider fee is derived automatically from how long the event runs (see pricing)."],
            ["Choose how it runs", "Pick one of the three modes below. You can start free and upgrade later if the field grows."],
            ["Rider classes (optional)", "Add the categories you race — RallyPro, Rally1, Adventure, and so on. Riders pick from this list when they self-register, and the map colour-codes by class."],
            ["Route (optional)", "Upload a route GPX to draw the course on the map. Multi-day events can be broken into stages so each day has its own leg."],
          ]}
        />
        <Sub>The three ride types</Sub>
        <Table
          head={["Mode", "Who pays", "Capacity"]}
          rows={[
            ["Free group ride", "Nobody — no charge", "Up to 10 riders. The default; perfect for a ride with friends."],
            ["I'll pay for more riders", "You, the organizer", "$200 unlocks 40 riders, then +$40 per additional 10. You go to checkout right after creating the event."],
            ["Riders pay at join", "Each rider, at registration", "Unlimited; each rider pays a small fee ($10 / $12 / $15) set by event length. A rider only appears on the map after paying."],
          ]}
        />
        <Callout
          tone="info"
          title="You can change your mind"
          body="Create the event as a free group ride to try it out. If the roster grows past 10, upgrade to a paid event from inside the event page — nothing you've already set up is lost."
        />
      </Section>

      <Section id="o-roster" eyebrow="For organizers · 3" title="Build your roster">
        <P>
          Your <strong style={strong}>roster</strong> is the list of entrants and the beacon each one carries. There are two ways
          to build it, and you can mix them freely.
        </P>
        <Sub>Add riders one at a time</Sub>
        <P>
          Open your event and use <strong style={strong}>Add entrant</strong>. Enter the rider&rsquo;s name, number and class, then
          paste their beacon share link and choose the device type (Garmin, SPOT or ZOLEO). Use{" "}
          <strong style={strong}>Test</strong> to confirm Waypoint can reach the feed before the event starts — a green result
          means you&rsquo;re good; an error tells you exactly what&rsquo;s wrong (almost always a private MapShare page).
        </P>
        <Sub>Let riders add themselves</Sub>
        <P>
          Prefer not to chase everyone for links? Share your event&rsquo;s <strong style={strong}>join code</strong> or link and let
          riders register themselves — they add their own details, emergency info and beacon. Covered in the rider section below.
        </P>
        <Callout
          tone="info"
          title="Fix-ups are easy"
          body="You can edit any entrant's number, class or beacon link at any time, and remove entrants who drop out. Corrections you make always win over what a rider entered."
        />
      </Section>

      <Section id="o-csv" eyebrow="For organizers · 4" title="Import a roster by CSV" tint>
        <P>
          For a full field, the fastest path is a CSV import. On the roster screen, download the{" "}
          <strong style={strong}>template</strong> (<Code>waypoint-entrants-template.csv</Code>), fill it in — a spreadsheet like
          Numbers or Excel is fine — and upload it. Waypoint shows a <strong style={strong}>dry-run preview</strong> first, so you
          see exactly what will import before anything is written. A bad row is flagged by line number and never blocks the good
          ones.
        </P>
        <Sub>The columns</Sub>
        <P>
          Only <strong style={strong}>name</strong> is truly required, plus enough to locate a beacon. Column headings are
          matched loosely — &ldquo;Rider Name&rdquo;, &ldquo;Bib&rdquo;, &ldquo;Category&rdquo; and &ldquo;Share Link&rdquo; all
          resolve — so you don&rsquo;t have to match the names exactly.
        </P>
        <Table
          mono0
          head={["Column", "Required", "What goes here"]}
          rows={[
            ["name", "Yes", "The rider's name."],
            ["number", "Optional", "Bib / rider number, e.g. 42."],
            ["class", "Optional", "Category — should match one of your event classes."],
            ["device", "For beacons", "One of: garmin, spot, or zoleo."],
            ["feed", "Depends", "Garmin MapShare URL, or the SPOT feed ID. Leave blank for ZOLEO."],
            ["password", "Garmin only", "Only if the rider's Garmin MapShare page is password-protected."],
            ["waypoint_id", "Optional", "A rider's Waypoint code (e.g. WPX7K2) to link an existing app user."],
            ["email", "Optional", "Rider email, for your records."],
            ["ice_name", "Optional", "Emergency contact name."],
            ["ice_phone", "Optional", "Emergency contact phone."],
            ["blood_type", "Optional", "e.g. O+. Shown only on the private responder view."],
            ["allergies", "Optional", "e.g. penicillin. Private responder view only."],
            ["notes", "Optional", "Anything else for your own reference."],
          ]}
        />
        <Sub>What to put in the feed column, by device</Sub>
        <Table
          head={["device", "feed value"]}
          rows={[
            ["garmin", "The rider's Garmin MapShare URL. Any shape works — share.garmin.com/Name, /share/Name, /Feed/Share/Name, or a regional host — Waypoint normalises it."],
            ["spot", "The rider's SPOT shared-page feed ID (the long code from their SPOT share settings)."],
            ["zoleo", "Nothing. ZOLEO pushes positions to Waypoint by webhook, so the feed column stays empty."],
          ]}
        />
        <Callout
          tone="warn"
          title="The #1 setup mistake: a private MapShare"
          body="A Garmin beacon only works if the rider's inReach MapShare page is turned on and public. If it's off or password-protected, Waypoint gets a 401/403 and the rider shows 'No fix yet'. Either have them make MapShare public, or put the page password in the password column."
        />
        <P>
          The importer is forgiving about file quirks — quoted commas, line breaks inside a cell, Windows line endings and Excel&rsquo;s
          hidden byte-order mark are all handled. Just export a normal CSV and upload it.
        </P>
      </Section>

      <Section id="o-polling" eyebrow="For organizers · 5" title="How tracking updates">
        <P>
          Once beacons are on the roster, Waypoint does the work. It polls every entrant&rsquo;s feed roughly{" "}
          <strong style={strong}>every two minutes</strong> and drops each new fix on the map and into the recovery feeds. You
          don&rsquo;t start or stop anything — it runs for the life of the event.
        </P>
        <P>
          Satellite beacons report every few minutes at best, and terrain can block the sky, so every rider carries a{" "}
          <strong style={strong}>status</strong> based on how recently they were last heard from. The thresholds are deliberately
          generous — a normal gap shouldn&rsquo;t read as an emergency.
        </P>
        <div id="ref-status" style={{ scrollMarginTop: 20 }}>
          <StatusLegend />
        </div>
      </Section>

      <Section id="o-map" eyebrow="For organizers · 6" title="Read the live map" tint>
        <P>
          The <strong style={strong}>Live map</strong> tab is your command surface. Every entrant is a coloured marker on
          satellite imagery, labelled by number and last-seen time.
        </P>
        <Steps
          items={[
            ["Satellite by default", "The map opens on high-resolution Esri World Imagery. Switch layers any time — Esri with labels, Mapbox Satellite, USGS Topo, OpenTopoMap or plain streets — from the layer switcher."],
            ["Filter and search", "Narrow the map to a single class, or search a rider by name or number to jump straight to them."],
            ["Measure distances", "The ruler tool measures point-to-point on the map with a running total, per-leg bearing, and a km/mi toggle — handy for 'how far to the next checkpoint?'"],
            ["Tap a rider", "Open any entrant to see their recent track, exact last fix, and status. Their emergency info stays on the private responder view, never here."],
          ]}
        />
      </Section>

      <Section id="o-command" eyebrow="For organizers · 7" title="Command view & SOS">
        <P>
          <strong style={strong}>Command view</strong> is a focused, access-controlled version of the live map for the people
          running the event — race control and the recovery crew. You hand it out as its own link, separate from your organizer
          login, and its access <strong style={strong}>expires when the event ends</strong>, so a link can&rsquo;t be reused next
          season.
        </P>
        <P>
          If a rider triggers an <strong style={strong}>SOS</strong> on their beacon, or goes dark in a way that warrants
          attention, the event surfaces it so your team can respond. Each entrant&rsquo;s{" "}
          <strong style={strong}>emergency card</strong> — contact, phone, blood type, allergies — is reachable from the private
          responder view for exactly this moment, and is never shown on any public map.
        </P>
        <Callout
          tone="warn"
          title="Waypoint adds visibility — it isn't a rescue service"
          body="Tracking helps you see and respond faster, but it is a recreational tool, not a replacement for a dedicated emergency locator beacon or for real safety planning. Riders should always carry and use proper emergency equipment and trigger a real SOS on their device in an emergency."
        />
      </Section>

      <Section id="o-share" eyebrow="For organizers · 8" title="Share your event" tint>
        <P>
          Everything you share lives on the <strong style={strong}>Share</strong> tab. Pick the audience:
        </P>
        <Table
          head={["Share option", "For", "What it is"]}
          rows={[
            ["Public event page", "Fans, family, sponsors", "A full-screen live map and roster on its own link. Emergency and SOS details are never shown."],
            ["Website embed", "Your event site", "A one-line iframe that drops the same live map into your own web page."],
            ["Google Earth Pro feed", "Recovery / race control", "A private network-link that streams live tracks into Google Earth Pro. Issue a named credential per person; every access is logged and expires with the event."],
            ["Join code / links", "Your riders", "The code or per-rider link riders use to register themselves."],
          ]}
        />
        <P>
          The Google Earth Pro feed is the one your recovery team will love: open Google Earth Pro, add the network link once, and
          every rider&rsquo;s live position and trail appears over full 3-D terrain, refreshing on its own.
        </P>
      </Section>

      <Section id="o-brand" eyebrow="For organizers · 9" title="Branding & white-label">
        <P>
          On a <strong style={strong}>series license</strong>, the public event page and the website embed carry{" "}
          <strong style={strong}>your</strong> logo and colours instead of Waypoint&rsquo;s, with just a small
          &ldquo;powered by Waypoint&rdquo; credit and a link back. Set your logo and brand colours once in your org settings and
          they apply across every event and embed you run.
        </P>
      </Section>

      <Section id="o-pricing" eyebrow="For organizers · 10" title="Pricing & billing" tint>
        <P>
          Start free and pay only when your field grows. Everything is handled through secure Stripe checkout, and you can manage
          or cancel a subscription from the billing portal any time.
        </P>
        <Table
          head={["Plan", "Price", "What you get"]}
          rows={[
            ["Free group ride", "$0", "Up to 10 riders. The default mode."],
            ["Event (you pay)", "$200", "40 rider seats. Add +10 seats for $40 whenever you need them."],
            ["Entrant-paid", "$10–$15 / rider", "Riders pay at join. Fee by event length: up to 3 days $10, up to 7 days $12, up to 30 days $15."],
            ["Org series license", "$3,500 / year", "A 1,500-entrant pool across all your events, plus white-label branding."],
          ]}
        />
        <P>
          Running many events a season, or a large rally series? The org license is usually cheaper than paying per event and
          gives you the branded, white-label look on top.
        </P>
      </Section>

      {/* ══════════ RIDERS ══════════ */}

      <Section
        id="r-join"
        eyebrow="For riders · 1"
        title="Join an event"
        lead="No app to install and no account required. Your organizer gives you a join code or a link — that's all you need."
      >
        <Steps
          items={[
            ["Open the link or enter the code", "Tap the link your organizer sent, or enter the join code they gave you. Either one takes you straight to that event's registration."],
            ["You're in the right place", "You'll see the event name at the top so you know you're registering for the correct ride."],
          ]}
        />
      </Section>

      <Section id="r-register" eyebrow="For riders · 2" title="Register & emergency info" tint>
        <P>Registration is one short screen:</P>
        <Steps
          items={[
            ["Your details", "Name, rider number, and class (you'll pick from the organizer's list if they set one). Don't stress the number or class — the organizer can correct either later."],
            ["Emergency info (optional but encouraged)", "Add an emergency contact, phone, blood type and allergies. This is shared only with the event organizer and emergency responders, and is never shown on the public map."],
            ["Consent & join", "If you add medical or emergency details, tick the consent box to share them for this event, then join. Done — you're on the roster."],
          ]}
        />
        <Callout
          tone="info"
          title="Your private info stays private"
          body="Emergency and medical details live on a responder-only card. Spectators watching the public map never see them — they see your position and status, nothing more."
        />
      </Section>

      <Section id="r-beacon" eyebrow="For riders · 3" title="Connect your tracker">
        <P>
          Waypoint shows your position by reading the <strong style={strong}>satellite beacon you already own</strong>. After you
          join, set up your tracker from your dashboard — pick your device type and connect it as below. If your organizer added
          you from a roster, they may have done this for you already; it&rsquo;s worth confirming.
        </P>

        <Sub>Garmin inReach</Sub>
        <div id="r-garmin" style={{ scrollMarginTop: 20 }} />
        <P>
          Garmin works through your <strong style={strong}>MapShare</strong> page. Two things have to be true:
        </P>
        <Steps
          items={[
            ["Turn MapShare on", "In your Garmin Explore / inReach account, enable MapShare for your device. This creates your public share page at share.garmin.com/YourName."],
            ["Keep it public (or share the password)", "Waypoint reads that page to get your fixes. If MapShare is off or password-protected, Waypoint can't see you and you'll show 'No fix yet'. Either leave it public, or give your organizer the page password."],
            ["Give your organizer the link", "Paste your MapShare URL into registration (or hand it to your organizer). Any form of the link works."],
          ]}
        />
        <Callout
          tone="warn"
          title="If you show 'No fix yet', check MapShare first"
          body="A private or password-protected MapShare is the single most common reason a Garmin rider doesn't appear. Open your share.garmin.com page in a private browser window — if you can't see it without logging in, Waypoint can't either."
        />

        <Sub>SPOT</Sub>
        <div id="r-spot" style={{ scrollMarginTop: 20 }} />
        <P>
          SPOT works through a <strong style={strong}>shared page feed</strong>. In your SPOT account, create or open a Shared Page
          for your device and copy its <strong style={strong}>feed ID</strong> (the long code). Give that to your organizer, or
          enter it when you register. That&rsquo;s all SPOT needs.
        </P>

        <Sub>ZOLEO</Sub>
        <div id="r-zoleo" style={{ scrollMarginTop: 20 }} />
        <P>
          ZOLEO is the simplest — it <strong style={strong}>pushes</strong> your location to Waypoint automatically, so there&rsquo;s
          no feed link to copy. Enable location sharing on your ZOLEO account so your positions flow through, and you&rsquo;re set.
        </P>

        <Sub>Phone-based tracking</Sub>
        <div id="r-phone" style={{ scrollMarginTop: 20 }} />
        <P>
          No satellite beacon? You can share your position from your phone for convenience. It&rsquo;s great where you have signal —
          but remember it depends on cell coverage, so for real backcountry it is no substitute for a satellite device.
        </P>
        <Callout
          tone="info"
          title="Test before the start"
          body="Ask your organizer to hit 'Test' on your entry, or check that your marker appears on the map, before the flag drops. Five minutes of setup the day before saves a scramble at the start line."
        />
      </Section>

      <Section
        id="r-watch"
        eyebrow="For riders · 4"
        title="What you'll see"
        tint
      >
        <P>
          Once you&rsquo;re reporting, you and anyone you share the public link with can watch the whole field move across the map in
          near real time, colour-coded by class. Your family can follow you from home; your crew can see where you are on the
          course. Your emergency details stay off that public view — only the organizer and responders can reach them.
        </P>
      </Section>

      {/* ══════════ REFERENCE ══════════ */}

      <Section id="ref-trouble" eyebrow="Reference" title="Troubleshooting">
        <Table
          head={["Symptom", "Most likely cause & fix"]}
          rows={[
            ["Rider shows 'No fix yet'", "The beacon feed can't be reached. For Garmin, MapShare is off or password-protected — make it public or add the password. For SPOT, the feed ID is wrong or the shared page is off."],
            ["Rider stuck on 'Stale'", "Normal in canyons, timber or bad sky. If it persists for a long stretch, the beacon may be off, out of battery, or the rider has stopped. Worth a radio check late in a stage."],
            ["Garmin link 'doesn't work'", "Any MapShare URL shape is accepted, so it's rarely the format — it's almost always the page being private. Open it in a private browser window to confirm it's public."],
            ["Rider paid but isn't on the map", "Entrant-paid riders appear only after payment clears. If they just paid, give it a moment and refresh."],
            ["Can't add an 11th rider", "You're on a free group ride (10-rider cap). Upgrade the event to add more seats."],
          ]}
        />
      </Section>

      <Section id="ref-faq" eyebrow="Reference" title="Quick FAQ" tint>
        <Sub>Do my riders need to install an app?</Sub>
        <P>No. Riders register from a link and are tracked through the beacon they already carry. There&rsquo;s nothing to download.</P>
        <Sub>Do I need to buy any hardware?</Sub>
        <P>No. Waypoint reads Garmin inReach, SPOT and ZOLEO devices your riders already own.</P>
        <Sub>How often do positions update?</Sub>
        <P>Waypoint checks every beacon about every two minutes; how often each one reports depends on the rider&rsquo;s device settings.</P>
        <Sub>Is my location data sold?</Sub>
        <P>Never. See our <Link href="/privacy" style={linkS}>Privacy Policy</Link>.</P>
        <Sub>Can spectators see emergency or medical info?</Sub>
        <P>No. That information is only on the private responder view for the organizer and emergency responders.</P>
      </Section>

      {/* CTA */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "64px 28px", textAlign: "center" }}>
        <h2 style={{ ...h2, marginBottom: 12 }}>Ready to put your event on the map?</h2>
        <p style={{ color: C.muted, fontSize: 16, margin: "0 0 26px" }}>Free for group rides. No hardware to buy — riders keep the beacons they already own.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/signup" style={{ background: C.lime, color: C.accentInk, fontWeight: 800, fontSize: text.lg, padding: "14px 28px", borderRadius: 4, textDecoration: "none", letterSpacing: 0.2 }}>
            Create your event
          </Link>
          <Link href="/how-it-works" style={{ border: `1px solid ${C.hairline}`, color: C.ink, fontWeight: 600, fontSize: text.lg, padding: "14px 28px", borderRadius: 4, textDecoration: "none" }}>
            How it works
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.hairline}`, padding: "28px", background: C.surface }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontSize: text.base, color: C.muted }}>
          <span>&copy; {new Date().getFullYear()} Waypoint &middot; a Chasing Waypoints product</span>
          <span style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/how-it-works" style={{ color: C.muted, textDecoration: "none" }}>How it works</Link>
            <Link href="/terms" style={{ color: C.muted, textDecoration: "none" }}>Terms</Link>
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "none" }}>Privacy</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}

const linkS: React.CSSProperties = { color: C.accent, textDecoration: "none" };
const strong: React.CSSProperties = { color: C.ink, fontWeight: 700 };
