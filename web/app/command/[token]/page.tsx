"use client";

import { useEffect, useRef, useState, use } from "react";
import TrackingMap, { Entrant, StageLine } from "../../../components/TrackingMap";
import { theme, font, text } from "../../../lib/theme";

/**
 * Command View — a full-screen, read-only, no-login live map for recovery,
 * sweep, and command-post teams. Authorized by a command/participant GEP token
 * (validated server-side). Shows every entrant, SOS, and ICE on tap. Replaces
 * the live Google Earth Pro use case for macOS users.
 */

interface CommandData {
  event?: { name: string; status: string; suspended?: boolean };
  stages?: StageLine[];
  entrants?: Entrant[];
  error?: string;
}

export default function CommandViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<CommandData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sosFocus, setSosFocus] = useState<string | undefined>(undefined);
  const seenSos = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/command/${token}`);
        if (!res.ok) { if (alive) setError(res.status === 404 ? "This command link is invalid or expired." : "Could not load."); return; }
        const d: CommandData = await res.json();
        if (!alive) return;
        setError(null);
        setData(d);
        const active = (d.entrants ?? []).filter((e) => e.sos);
        const fresh = active.find((e) => !seenSos.current.has(e.id));
        if (fresh) setSosFocus(fresh.id);
        seenSos.current = new Set(active.map((e) => e.id));
      } catch { if (alive) setError("Network error."); }
    }
    load();
    const t = setInterval(load, 30000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [token]);

  const entrants: Entrant[] = data?.entrants ?? [];
  const sosEntrants = entrants.filter((e) => e.sos);
  const suspended = data?.event?.suspended;

  if (error) {
    return <Centered>{error}</Centered>;
  }
  if (!data) {
    return <Centered>Loading command view…</Centered>;
  }
  if (suspended) {
    return <Centered>This event is currently unavailable.</Centered>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: theme.canvas }}>
      <header style={{ background: theme.surface, borderBottom: `1px solid ${theme.hairline}`, padding: "10px 16px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `700 15px ${font.sans}`, color: theme.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.event?.name ?? "Command View"}
          </div>
          <div style={{ font: `700 10px ${font.sans}`, letterSpacing: 1, textTransform: "uppercase", color: theme.danger }}>
            Command View · read-only
          </div>
        </div>
        <span style={{ marginLeft: "auto", font: `11px ${font.sans}`, color: theme.muted }}>powered by Waypoint</span>
      </header>

      <div style={{ flex: 1, position: "relative" }}>
        {sosEntrants.length > 0 && (
          <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 6, width: "min(92%, 460px)", display: "flex", flexDirection: "column", gap: 6 }}>
            {sosEntrants.map((e) => (
              <div key={e.id} className="wp-pulse" style={{ background: "#FF3B30", color: "#fff", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,.5)" }}>
                <span style={{ fontSize: text.xl }}>&#9888;</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: text.base }}>SOS — {e.number ? `#${e.number} ` : ""}{e.name}</div>
                  <div style={{ fontSize: text.xs, opacity: 0.85 }}>Tap Locate for position &amp; ICE.</div>
                </div>
                <button onClick={() => setSosFocus(e.id)} style={{ background: "#fff", color: "#B3261E", border: "none", borderRadius: 4, padding: "6px 10px", fontSize: text.xs, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Locate</button>
              </div>
            ))}
          </div>
        )}
        <TrackingMap
          entrants={entrants}
          stages={data.stages ?? []}
          commandMode
          focusEntrantId={sosFocus}
        />
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.muted, display: "flex", alignItems: "center", justifyContent: "center", font: `14px ${font.sans}`, padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}
