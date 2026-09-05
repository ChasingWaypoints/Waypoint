"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { theme, font } from "../../lib/theme";

/**
 * First-run onboarding — three steps, skippable. Picks a path (track yourself
 * vs organize), then shows the two next actions for that path. Choosing a path
 * (or skipping) stamps profiles.onboarded_at so the dashboard stops redirecting
 * here.
 */

type Path = "self" | "organize";

export default function OnboardingPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [path, setPath] = useState<Path | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setUid(session.user.id);
    });
  }, [supabase]);

  async function markOnboarded() {
    if (uid) await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", uid);
  }
  async function choose(p: Path) { await markOnboarded(); setPath(p); }
  async function finish() { await markOnboarded(); router.push("/dashboard"); }

  return (
    <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.body, font: `14px ${font.sans}`, display: "flex", flexDirection: "column" }}>
      <nav style={{ background: theme.surface, borderBottom: `1px solid ${theme.hairline}`, padding: "0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ color: theme.ink, fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>Waypoint</span>
        <button onClick={finish} style={{ background: "transparent", border: "none", color: theme.muted, fontSize: 12, cursor: "pointer" }}>Skip →</button>
      </nav>

      <div style={{ maxWidth: 520, width: "100%", margin: "0 auto", padding: "36px 16px", boxSizing: "border-box" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Welcome to Waypoint</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.ink, margin: "0 0 22px" }}>
          {path === null ? "What brings you here?" : path === "self" ? "Track yourself" : "Run an event"}
        </h1>

        {path === null && (
          <div style={{ display: "grid", gap: 12 }}>
            <ChoiceCard title="I'm tracking myself" body="Share your live location on a map for family and friends — from your phone or a satellite beacon." onClick={() => choose("self")} />
            <ChoiceCard title="I'm organizing an event" body="Put every entrant's beacon on one live map, load a roster, and share it with your community." onClick={() => choose("organize")} />
          </div>
        )}

        {path === "self" && (
          <div style={{ display: "grid", gap: 12 }}>
            <StepCard n={1} title="Add a device" body="Link a Garmin inReach, SPOT, or ZOLEO so Waypoint can pull your position." href="/dashboard/profile" cta="Add a device" />
            <StepCard n={2} title="Or track from this phone" body="No beacon? Start a browser trip and your phone becomes the tracker." href="/track" cta="Start tracking" />
            <FinishRow onFinish={finish} />
          </div>
        )}

        {path === "organize" && (
          <div style={{ display: "grid", gap: 12 }}>
            <StepCard n={1} title="Create your event" body="Give it a name and you'll get a join code and a shareable live map." href="/dashboard/events/create" cta="Create event" />
            <StepCard n={2} title="Load your roster" body="Import competitors from one CSV — beacons, classes, and emergency (ICE) info — from the event's Entrants tab." href="/dashboard" cta="Go to dashboard" />
            <FinishRow onFinish={finish} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 10, padding: 18, cursor: "pointer", color: theme.body }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.5 }}>{body}</div>
    </button>
  );
}

function StepCard({ n, title, body, href, cta }: { n: number; title: string; body: string; href: string; cta: string }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 10, padding: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: theme.canvas, border: `1px solid ${theme.hairline}`, color: theme.accent, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.5, marginBottom: 12 }}>{body}</div>
        <Link href={href} style={{ display: "inline-block", background: theme.track, color: theme.accentInk, borderRadius: 6, padding: "9px 16px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>{cta}</Link>
      </div>
    </div>
  );
}

function FinishRow({ onFinish }: { onFinish: () => void }) {
  return (
    <button onClick={onFinish} style={{ background: "transparent", color: theme.muted, border: `1px solid ${theme.hairline}`, borderRadius: 6, padding: "11px 0", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
      Go to dashboard
    </button>
  );
}
