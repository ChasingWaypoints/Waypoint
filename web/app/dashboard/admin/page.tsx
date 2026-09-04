"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

interface AdminEvent {
  id: string;
  name: string;
  status: string;
  join_code: string;
  share_token: string;
  created_at: string;
  organizer_id: string;
  organizer_email: string | null;
  participant_count: number;
  reporting_count: number;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#CCFF00", planning: "#FFFE15", completed: "#7E93A0", cancelled: "#FF3B30",
};

export default function AdminPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      const res = await fetch("/api/admin/events", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (res.status === 403) { setForbidden(true); setLoading(false); return; }
      if (!res.ok) { setError("Could not load events."); setLoading(false); return; }
      const d = await res.json();
      setEvents(d.events ?? []);
      setLoading(false);
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        (e.organizer_email ?? "").toLowerCase().includes(s) ||
        e.join_code.toLowerCase().includes(s)
    );
  }, [events, q]);

  const stats = useMemo(() => {
    const active = events.filter((e) => e.status === "active").length;
    const riders = events.reduce((n, e) => n + e.participant_count, 0);
    const overCap = events.filter((e) => e.participant_count > 60).length;
    return { total: events.length, active, riders, overCap };
  }, [events]);

  if (loading) return <Shell><p style={{ color: "#7E93A0", fontSize: 14 }}>Loading…</p></Shell>;
  if (forbidden) return (
    <Shell>
      <h1 style={{ color: "#fff", fontSize: 20, margin: "0 0 8px" }}>Not authorized</h1>
      <p style={{ color: "#7E93A0", fontSize: 14 }}>This area is for super admins only.</p>
      <Link href="/dashboard" style={{ color: "#CCFF00", fontSize: 13 }}>← Back to dashboard</Link>
    </Shell>
  );

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 4px" }}>Super Admin</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>All Events</h1>
        </div>
        <Link href="/dashboard" style={{ color: "#7E93A0", fontSize: 12, textDecoration: "none" }}>← Dashboard</Link>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat label="Events" value={stats.total} />
        <Stat label="Active" value={stats.active} color="#CCFF00" />
        <Stat label="Total riders" value={stats.riders} />
        <Stat label="Over 60 entrants" value={stats.overCap} color={stats.overCap ? "#FF6B6B" : "#7E93A0"} />
      </div>

      {error && <p style={{ color: "#FF6B6B", fontSize: 13 }}>{error}</p>}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by event, organizer email, or join code…"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #1E3B4C", background: "#0C1E29", color: "#fff", fontSize: 14, outline: "none", marginBottom: 14, borderRadius: 4 }}
      />

      <div style={{ overflowX: "auto", border: "1px solid #1E3B4C", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
          <thead>
            <tr style={{ background: "#0C1E29", color: "#7E93A0", textAlign: "left" }}>
              <th style={th}>Event</th>
              <th style={th}>Organizer</th>
              <th style={th}>Type</th>
              <th style={th}>Riders</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Flags</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td style={td} colSpan={8}><span style={{ color: "#7E93A0" }}>No events match.</span></td></tr>
            ) : filtered.map((e) => {
              const isEvent = e.participant_count > 10;
              const overCap = e.participant_count > 60;
              return (
                <tr key={e.id} style={{ borderTop: "1px solid #14303F", background: "#0A0A0A" }}>
                  <td style={{ ...td, color: "#fff", fontWeight: 600 }}>
                    {e.name}
                    <div style={{ color: "#54697A", fontWeight: 400, fontSize: 11 }}>{e.join_code}</div>
                  </td>
                  <td style={{ ...td, color: "#C8D4DC" }}>{e.organizer_email ?? <span style={{ color: "#54697A" }}>—</span>}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: isEvent ? "#CCFF00" : "#7E93A0", border: `1px solid ${isEvent ? "#CCFF00" : "#3a4550"}`, borderRadius: 10, padding: "1px 8px" }}>
                      {isEvent ? "Event" : "Ride"}
                    </span>
                  </td>
                  <td style={{ ...td, color: "#C8D4DC" }}>
                    {e.reporting_count}/{e.participant_count} <span style={{ color: "#54697A", fontSize: 11 }}>reporting</span>
                  </td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[e.status] ?? "#7E93A0", fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>{e.status}</span>
                  </td>
                  <td style={{ ...td, color: "#7E93A0" }}>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td style={td}>
                    {overCap && <span style={flag("#FF6B6B", "#2A1214", "#5A2530")}>60+ overage</span>}
                    {isEvent && !overCap && <span style={flag("#FFCF6B", "#2A2410", "#5A4A25")}>paid tier</span>}
                    {!isEvent && <span style={{ color: "#54697A", fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <a href={`/event/${e.share_token}`} target="_blank" rel="noopener noreferrer" style={{ color: "#CCFF00", textDecoration: "none", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>
                      View ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ background: "#0C1E29", padding: "0 24px", height: 48, display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
      </nav>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px" }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, color = "#fff" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", borderRadius: 4, padding: "12px 18px", minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#7E93A0", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
function flag(color: string, bg: string, border: string): React.CSSProperties {
  return { display: "inline-block", color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
}
