"use client";
import { text } from "../../../lib/theme";
import { LogoMark } from "@/components/LogoMark";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SkeletonRows } from "../../../components/Skeleton";

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
  paid: boolean;
  comped: boolean;
  suspended?: boolean;
  suspend_reason?: string | null;
}

interface PlatformStats {
  users: number; users_7d: number; subscribed: number; individual_subs: number; org_subs: number;
  events: number; active_events: number; events_7d: number; participants: number; reporting: number; paid_events: number;
}

interface Member {
  id: string; email: string | null; display_name: string | null; created_at: string;
  is_super_admin: boolean; sub_status: string | null; sub_plan: string | null;
  sub_until: string | null; org_status: string | null; events_organized: number;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#CCFF00", planning: "#FFFE15", completed: "#7E93A0", cancelled: "#FF3B30",
};

export default function AdminPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [mq, setMq] = useState("");
  const [view, setView] = useState<"events" | "members">("events");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      const auth = { Authorization: `Bearer ${session.access_token}` };
      const [res, sres, mres] = await Promise.all([
        fetch("/api/admin/events", { headers: auth, cache: "no-store" }),
        fetch("/api/admin/stats", { headers: auth, cache: "no-store" }),
        fetch("/api/admin/members", { headers: auth, cache: "no-store" }),
      ]);
      if (res.status === 403) { setForbidden(true); setLoading(false); return; }
      if (!res.ok) { setError("Could not load events."); setLoading(false); return; }
      const d = await res.json();
      setEvents(d.events ?? []);
      if (sres.ok) { const sd = await sres.json(); setPlatform(sd.stats ?? null); }
      if (mres.ok) { const md = await mres.json(); setMembers(md.members ?? []); }
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

  const filteredMembers = useMemo(() => {
    const s = mq.trim().toLowerCase();
    if (!s) return members;
    return members.filter(
      (m) =>
        (m.email ?? "").toLowerCase().includes(s) ||
        (m.display_name ?? "").toLowerCase().includes(s)
    );
  }, [members, mq]);

  async function toggleComp(e: AdminEvent) {
    const next = !e.comped;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/events/${e.id}/comp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ comped: next, reason: next ? "Platform-sponsored" : null }),
    });
    if (res.ok) {
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, comped: next } : x)));
    } else {
      setError("Could not update comp status.");
    }
  }

  async function toggleSuspend(e: AdminEvent) {
    const next = !e.suspended;
    let reason: string | null = null;
    if (next) {
      reason = window.prompt("Reason for suspending this event? (T&C violation, etc.)");
      if (reason === null) return; // cancelled
    }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/events/${e.id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ suspended: next, reason }),
    });
    if (res.ok) {
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, suspended: next, suspend_reason: reason } : x)));
    } else {
      setError("Could not update suspension.");
    }
  }

  async function endEvent(e: AdminEvent) {
    if (e.status === "completed" || e.status === "cancelled") return;
    if (!window.confirm(`End "${e.name}" now?\n\nThis marks it completed and immediately revokes command / recovery-crew access. Tracking stops.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/events/${e.id}/end`, {
      method: "POST",
      headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    });
    if (res.ok) {
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "completed" } : x)));
    } else {
      setError("Could not end the event.");
    }
  }

  async function deleteEvent(e: AdminEvent) {
    if (!window.confirm(`Permanently DELETE "${e.name}"?\n\nThis removes the event, its entire roster, and all tracking data. This cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/events/${e.id}/delete`, {
      method: "POST",
      headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    });
    if (res.ok) {
      setEvents((prev) => prev.filter((x) => x.id !== e.id));
    } else {
      setError("Could not delete the event.");
    }
  }

  const stats = useMemo(() => {
    const active = events.filter((e) => e.status === "active").length;
    const riders = events.reduce((n, e) => n + e.participant_count, 0);
    const overCap = events.filter((e) => e.participant_count > 60).length;
    return { total: events.length, active, riders, overCap };
  }, [events]);

  if (loading) return <Shell><SkeletonRows rows={4} /></Shell>;
  if (forbidden) return (
    <Shell>
      <h1 style={{ color: "#fff", fontSize: 20, margin: "0 0 8px" }}>Not authorized</h1>
      <p style={{ color: "#7E93A0", fontSize: text.md }}>This area is for super admins only.</p>
      <Link href="/dashboard" style={{ color: "#CCFF00", fontSize: text.base }}>← Back to dashboard</Link>
    </Shell>
  );

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 4px" }}>Super Admin</p>
          <h1 style={{ fontSize: text.xxl, fontWeight: 700, color: "#fff", margin: 0 }}>{view === "events" ? "All Events" : "Members"}</h1>
        </div>
        <Link href="/dashboard" style={{ color: "#7E93A0", fontSize: text.sm, textDecoration: "none" }}>← Dashboard</Link>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat label="Users" value={platform?.users ?? 0} color="#CCFF00" />
        <Stat label="New users · 7d" value={platform?.users_7d ?? 0} />
        <Stat label="Subscribed" value={platform?.subscribed ?? 0} color="#1FE0A0" />
        <Stat label="Not subscribed" value={platform ? Math.max(0, platform.users - platform.subscribed) : 0} />
        <Stat label="Individual" value={platform?.individual_subs ?? 0} />
        <Stat label="Org" value={platform?.org_subs ?? 0} />
        <Stat label="Events" value={platform?.events ?? stats.total} />
        <Stat label="Active" value={platform?.active_events ?? stats.active} color="#CCFF00" />
        <Stat label="Riders" value={platform?.participants ?? stats.riders} />
        <Stat label="Reporting" value={platform?.reporting ?? 0} />
        <Stat label="Paid events" value={platform?.paid_events ?? 0} />
        <Stat label="Over 60" value={stats.overCap} color={stats.overCap ? "#FF6B6B" : "#7E93A0"} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["events", "members"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            style={{ background: view === v ? "#CCFF00" : "transparent", color: view === v ? "#0C1E29" : "#C8D4DC", border: `1px solid ${view === v ? "#CCFF00" : "#3a4550"}`, padding: "7px 16px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", borderRadius: 4 }}>
            {v === "events" ? `Events (${events.length})` : `Members (${members.length})`}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#FF6B6B", fontSize: text.base }}>{error}</p>}

      {view === "events" && (<>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by event, organizer email, or join code…"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #1E3B4C", background: "#0C1E29", color: "#fff", fontSize: text.md, outline: "none", marginBottom: 14, borderRadius: 4 }}
      />

      <div style={{ overflowX: "auto", border: "1px solid #1E3B4C", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: text.base, minWidth: 820 }}>
          <thead>
            <tr style={{ background: "#0C1E29", color: "#7E93A0", textAlign: "left" }}>
              <th style={th}>Event</th>
              <th style={th}>Organizer</th>
              <th style={th}>Type</th>
              <th style={th}>Riders</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Flags</th>
              <th style={th}>Billing</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td style={td} colSpan={9}><span style={{ color: "#7E93A0" }}>No events match.</span></td></tr>
            ) : filtered.map((e) => {
              const isEvent = e.participant_count > 10;
              const overCap = e.participant_count > 60;
              return (
                <tr key={e.id} style={{ borderTop: "1px solid #14303F", background: "#0A0A0A" }}>
                  <td style={{ ...td, color: "#fff", fontWeight: 600 }}>
                    {e.name}
                    <div style={{ color: "#54697A", fontWeight: 400, fontSize: text.xs }}>{e.join_code}</div>
                  </td>
                  <td style={{ ...td, color: "#C8D4DC" }}>{e.organizer_email ?? <span style={{ color: "#54697A" }}>—</span>}</td>
                  <td style={td}>
                    <span style={{ fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: isEvent ? "#CCFF00" : "#7E93A0", border: `1px solid ${isEvent ? "#CCFF00" : "#3a4550"}`, borderRadius: 10, padding: "1px 8px" }}>
                      {isEvent ? "Event" : "Ride"}
                    </span>
                  </td>
                  <td style={{ ...td, color: "#C8D4DC" }}>
                    {e.reporting_count}/{e.participant_count} <span style={{ color: "#54697A", fontSize: text.xs }}>reporting</span>
                  </td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[e.status] ?? "#7E93A0", fontWeight: 700, textTransform: "uppercase", fontSize: text.xs }}>{e.status}</span>
                  </td>
                  <td style={{ ...td, color: "#7E93A0" }}>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td style={td}>
                    {overCap && <span style={flag("#FF6B6B", "#2A1214", "#5A2530")}>60+ overage</span>}
                    {isEvent && !overCap && <span style={flag("#FFCF6B", "#2A2410", "#5A4A25")}>paid tier</span>}
                    {e.suspended && <span style={flag("#FF3B30", "#2A1214", "#5A2525")} title={e.suspend_reason ?? undefined}>suspended</span>}
                    {!isEvent && <span style={{ color: "#54697A", fontSize: text.xs }}>—</span>}
                  </td>
                  <td style={td}>
                    {e.paid ? (
                      <span style={flag("#1FE0A0", "#0E2A22", "#1F5A47")}>Paid</span>
                    ) : e.comped ? (
                      <span style={flag("#CCFF00", "#26330A", "#4A5A25")}>Comped</span>
                    ) : isEvent ? (
                      <span style={{ color: "#FFCF6B", fontSize: text.xs, fontWeight: 700 }}>Unpaid</span>
                    ) : (
                      <span style={{ color: "#54697A", fontSize: text.xs }}>Free</span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => toggleComp(e)}
                      title={e.comped ? "Remove comp" : "Sponsor / comp this event"}
                      style={{ background: "transparent", border: `1px solid ${e.comped ? "#CCFF00" : "#3a4550"}`, color: e.comped ? "#CCFF00" : "#C8D4DC", padding: "4px 10px", fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", borderRadius: 4, marginRight: 8 }}
                    >
                      {e.comped ? "Uncomp" : "Comp"}
                    </button>
                    <button
                      onClick={() => toggleSuspend(e)}
                      title={e.suspended ? "Restore this event" : "Suspend this event (goes dark immediately)"}
                      style={{ background: "transparent", border: `1px solid ${e.suspended ? "#FF3B30" : "#3a4550"}`, color: e.suspended ? "#FF3B30" : "#C8D4DC", padding: "4px 10px", fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", borderRadius: 4, marginRight: 8 }}
                    >
                      {e.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                    {e.status !== "completed" && e.status !== "cancelled" && (
                      <button
                        onClick={() => endEvent(e)}
                        title="End this event now — marks it completed and revokes command / recovery access"
                        style={{ background: "transparent", border: "1px solid #3a4550", color: "#FFCF6B", padding: "4px 10px", fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", borderRadius: 4, marginRight: 8 }}
                      >
                        End
                      </button>
                    )}
                    <button
                      onClick={() => deleteEvent(e)}
                      title="Permanently delete this event and all its data"
                      style={{ background: "transparent", border: "1px solid #5A2525", color: "#FF3B30", padding: "4px 10px", fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer", borderRadius: 4, marginRight: 8 }}
                    >
                      Delete
                    </button>
                    <a href={`/event/${e.share_token}`} target="_blank" rel="noopener noreferrer" style={{ color: "#CCFF00", textDecoration: "none", fontWeight: 700, fontSize: text.xs, textTransform: "uppercase" }}>
                      View ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>)}

      {view === "members" && (
        <>
          <input
            value={mq}
            onChange={(e) => setMq(e.target.value)}
            placeholder="Search members by email or name…"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1px solid #1E3B4C", background: "#0C1E29", color: "#fff", fontSize: text.md, outline: "none", marginBottom: 14, borderRadius: 4 }}
          />
          <div style={{ overflowX: "auto", border: "1px solid #1E3B4C", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: text.base, minWidth: 640 }}>
              <thead>
                <tr style={{ background: "#0C1E29", color: "#7E93A0", textAlign: "left" }}>
                  <th style={th}>Member</th>
                  <th style={th}>Subscription</th>
                  <th style={th}>Events</th>
                  <th style={th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr><td style={td} colSpan={4}><span style={{ color: "#7E93A0" }}>No members match.</span></td></tr>
                ) : filteredMembers.map((m) => {
                  const sub = m.sub_status === "active"
                    ? { label: m.sub_plan === "individual_plus" ? "Plus" : "Individual", color: "#1FE0A0", bg: "#0E2A22", bd: "#1F5A47" }
                    : m.org_status === "active"
                    ? { label: "Org", color: "#CCFF00", bg: "#26330A", bd: "#4A5A25" }
                    : { label: "Free", color: "#7E93A0", bg: "transparent", bd: "#3a4550" };
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #14303F", background: "#0A0A0A" }}>
                      <td style={{ ...td, color: "#fff" }}>
                        {m.email ?? <span style={{ color: "#54697A" }}>—</span>}
                        {m.is_super_admin && <span style={{ ...flag("#CCFF00", "#26330A", "#4A5A25"), marginLeft: 8 }}>admin</span>}
                        {m.display_name && <div style={{ color: "#54697A", fontWeight: 400, fontSize: text.xs }}>{m.display_name}</div>}
                      </td>
                      <td style={td}><span style={flag(sub.color, sub.bg, sub.bd)}>{sub.label}</span></td>
                      <td style={{ ...td, color: "#C8D4DC" }}>{m.events_organized}</td>
                      <td style={{ ...td, color: "#7E93A0", whiteSpace: "nowrap" }}>{new Date(m.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ background: "#0C1E29", padding: "0 24px", height: 48, display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 700, fontSize: text.md, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}><LogoMark size={20} />Waypoint</Link>
      </nav>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px" }}>{children}</div>
    </div>
  );
}

function Stat({ label, value, color = "#fff" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", borderRadius: 4, padding: "12px 18px", minWidth: 110 }}>
      <div style={{ fontSize: text.xxl, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: text.xs, color: "#7E93A0", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap", fontSize: text.xs, textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
function flag(color: string, bg: string, border: string): React.CSSProperties {
  return { display: "inline-block", color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "1px 7px", fontSize: text.xxs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };
}
