"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StagesManager from "../../../../components/StagesManager";
import EventBranding from "../../../../components/EventBranding";
import LiveEventMap from "../../../../components/LiveEventMap";
import EntrantManager from "../../../../components/EntrantManager";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

const RIDER_COLORS = [
  "#FFFE15", "#00aa44", "#FF3B30", "#cc00aa",
  "#0099cc", "#ff6600", "#006699", "#cc6600",
];

interface TrackPoint { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }
interface Rider { id: string; display_name: string; role: string; rider_class: string | null; rider_number: string | null; latest: TrackPoint | null; track: TrackPoint[] }
interface GepCredential { id: string; display_name: string; gep_token: string; created_at: string }
interface AccessEntry { display_name: string; type: string; role?: string; access_count: number; last_seen: string; unique_ips: string[]; last_ip: string }
interface EventDetail {
  id: string; name: string; status: string; join_code: string; share_token: string;
  route_gpx: string | null; route_name: string | null; organizer_id: string;
  rider_classes: string[]; paid?: boolean; comped?: boolean;
}

type Tab = "map" | "riders" | "admin";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 10px" }}>
      {children}
    </p>
  );
}

function Btn({ onClick, color = "#CCFF00", border, children, disabled }: {
  onClick?: () => void; color?: string; border?: string;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: border ? "transparent" : (disabled ? "#1E3B4C" : color),
        color: border ? color : "#0C1E29",
        border: border ? `1px solid ${border}` : "none",
        padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<any>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [myGepToken, setMyGepToken] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [credentials, setCredentials] = useState<GepCredential[]>([]);
  const [accessLog, setAccessLog] = useState<AccessEntry[]>([]);
  const [tab, setTab] = useState<Tab>("map");
  const [loading, setLoading] = useState(true);
  const [newViewerName, setNewViewerName] = useState("");
  const [addingViewer, setAddingViewer] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>("");
  const [showShare, setShowShare] = useState(false);

  // Settings tab — class editor
  const [classInput, setClassInput] = useState("");
  const [editedClasses, setEditedClasses] = useState<string[] | null>(null); // null = not yet opened
  const [savingClasses, setSavingClasses] = useState(false);
  const [classesSaved, setClassesSaved] = useState(false);


  const authHeaders = useCallback((tok: string) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${tok}`,
  }), []);

  const load = useCallback(async (sess?: any) => {
    const s = sess ?? session;
    if (!s) return;
    const res = await fetch(`/api/events/${id}`, { headers: { Authorization: `Bearer ${s.access_token}` } });
    if (!res.ok) return;
    const json = await res.json();
    setEvent(json.event);
    setRiders(json.riders ?? []);
    setMyGepToken(json.my_gep_token);
    setIsOrganizer(json.is_organizer);
    setLoading(false);
  }, [id, session]);

  const loadCredentials = useCallback(async (sess?: any) => {
    const s = sess ?? session;
    if (!s) return;
    const res = await fetch(`/api/events/${id}/gep-credentials`, { headers: { Authorization: `Bearer ${s.access_token}` } });
    if (res.ok) setCredentials(await res.json());
  }, [id, session]);

  const loadAccessLog = useCallback(async (sess?: any) => {
    const s = sess ?? session;
    if (!s) return;
    const res = await fetch(`/api/events/${id}/gep-access`, { headers: { Authorization: `Bearer ${s.access_token}` } });
    if (res.ok) {
      const json = await res.json();
      setAccessLog(json.summary ?? []);
    }
  }, [id, session]);

  // Auth + initial load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (!sess) { router.push("/auth/login"); return; }
      setSession(sess);
      load(sess);
    });
  }, []);

  // Load GEP data when switching to GEP tab
  useEffect(() => {
    if (tab === "admin" && session && isOrganizer) {
      loadCredentials();
      loadAccessLog();
    }
  }, [tab, isOrganizer, session]);

  // Auto-refresh riders for active events
  useEffect(() => {
    if (!event || event.status !== "active" || !session) return;
    const t = setInterval(() => load(), 20000);
    return () => clearInterval(t);
  }, [event?.status, session]);


  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(""), 2000);
    });
  }

  async function endEvent() {
    if (!session || !event) return;
    if (!confirm(`End event "${event.name}"?`)) return;
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ status: "completed" }),
    });
    await load();
  }

  async function goLive() {
    if (!session || !event) return;
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ status: "active" }),
    });
    await load();
  }

  async function startEventCheckout() {
    if (!session) return;
    const res = await fetch("/api/billing/event-checkout", {
      method: "POST",
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ eventId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
    else alert(data.error ?? "Could not start checkout. Please try again.");
  }

  async function addViewer() {
    const name = newViewerName.trim();
    if (!name || !session) return;
    setAddingViewer(true);
    const res = await fetch(`/api/events/${id}/gep-credentials`, {
      method: "POST",
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ display_name: name }),
    });
    if (res.ok) {
      const cred = await res.json();
      setCredentials((prev) => [...prev, cred]);
      setNewViewerName("");
    }
    setAddingViewer(false);
  }

  async function revokeViewer(credId: string, name: string) {
    if (!session || !confirm(`Revoke ${name}'s GEP link? Their feed stops immediately.`)) return;
    const res = await fetch(`/api/events/${id}/gep-credentials/${credId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setCredentials((prev) => prev.filter((c) => c.id !== credId));
  }

  async function removeRider(riderId: string, name: string) {
    if (!session || !confirm(`Remove ${name} from this event? This deletes their roster entry and stops tracking them.`)) return;
    const res = await fetch(`/api/events/${id}/entrants/${riderId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
    } else {
      alert("Could not remove that rider. Please try again.");
    }
  }

  // Initialize editedClasses when Settings tab is opened
  function openSettings() {
    if (editedClasses === null && event) setEditedClasses(event.rider_classes ?? []);
    setTab("admin");
  }

  function addEditedClass() {
    const val = classInput.trim();
    if (!val) return;
    setEditedClasses((prev) => (prev ?? []).includes(val) ? (prev ?? []) : [...(prev ?? []), val]);
    setClassInput("");
  }

  async function saveClasses() {
    if (!session || !event || editedClasses === null) return;
    setSavingClasses(true);
    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ rider_classes: editedClasses }),
    });
    setSavingClasses(false);
    if (res.ok) {
      await load(); // refresh event so rider_classes is updated everywhere
      setClassesSaved(true);
      setTimeout(() => setClassesSaved(false), 2500);
    }
  }

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#7E93A0" }}>Loading event...</p>
    </div>
  );
  if (!event) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#FF3B30" }}>Event not found.</p>
    </div>
  );

  const isLive = event.status === "active";
  const gepBase = typeof window !== "undefined" ? window.location.origin : "";
  const myGepUrl = myGepToken ? `${gepBase}/api/events/${event.id}/gep/${myGepToken}/network-link.kml` : null;
  const publicUrl = `${gepBase}/event/${event.share_token}`;
  const embedUrl = `${gepBase}/embed/${event.share_token}`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="600" style="border:0" allow="fullscreen"></iframe>`;
  // Group ride (≤10 riders) vs event (>10) — drives the shared wording.
  const groupNoun = riders.length > 10 ? "event" : "ride";
  const inviteText =
    `You're invited to ${event.name} on Waypoint.\n\n` +
    `Already a Waypoint user? Open your dashboard, tap \u201cJoin a ride or event\u201d, and enter code: ${event.join_code}\n\n` +
    `New to Waypoint or just following along? Watch the live map: ${publicUrl}`;

  const NAV_H = 48;
  const HEADER_H = 56;
  const TABS_H = 40;
  const contentH = `calc(100vh - ${NAV_H + HEADER_H + TABS_H}px)`;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>

      {/* Nav */}
      <nav style={{ background: "#0C1E29", padding: "0 24px", height: NAV_H, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
        <Link href="/dashboard" style={{ color: "#7E93A0", fontSize: 12, textDecoration: "none" }}>← Dashboard</Link>
      </nav>

      {/* Event header */}
      <div style={{ background: "#14303F", padding: "0 24px", height: HEADER_H, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isLive && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#CCFF00", display: "inline-block" }} />}
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{event.name}</h1>
            <p style={{ fontSize: 11, color: "#7E93A0", margin: 0 }}>
              {riders.length <= 10 && (
                <>Join code: <strong style={{ color: "#fff", letterSpacing: 1 }}>{event.join_code}</strong>{" · "}</>
              )}
              {riders.length} rider{riders.length !== 1 ? "s" : ""}
              {" · "}<span style={{ color: isLive ? "#CCFF00" : "#7E93A0", fontWeight: 700, textTransform: "uppercase" }}>{event.status}</span>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isOrganizer && event.paid && (
            <span style={{ border: "1px solid #1F5A47", color: "#1FE0A0", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>✓ Paid</span>
          )}
          {isOrganizer && !event.paid && event.comped && (
            <span style={{ border: "1px solid #4A5A25", color: "#CCFF00", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>★ Sponsored</span>
          )}
          {isOrganizer && !event.paid && !event.comped && (
            <button
              onClick={startEventCheckout}
              title="Upgrade this ride to a paid event (needed past 10 riders)"
              style={{ background: "#FFFE15", border: "1px solid #FFFE15", color: "#0C1E29", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
            >
              Upgrade $200
            </button>
          )}
          <button
            onClick={() => setShowShare(true)}
            style={{ background: "transparent", border: "1px solid #3a4550", color: "#C8D4DC", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
          >
            Share
          </button>
          <a href={`/event/${event.share_token}`} target="_blank" rel="noopener noreferrer"
            style={{ background: "transparent", border: "1px solid #3a4550", color: "#C8D4DC", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
            Public View ↗
          </a>
          {isOrganizer && (
            <Link href={`/dashboard/events/${id}/track`}
              style={{ background: "#CCFF00", border: "1px solid #CCFF00", color: "#0C1E29", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
              Tracking Page
            </Link>
          )}
          {isOrganizer && !isLive && event.status !== "completed" && event.status !== "cancelled" && (
            <button
              onClick={goLive}
              style={{ background: "#CCFF00", border: "1px solid #CCFF00", color: "#0C1E29", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
            >
              ● Go Live
            </button>
          )}
          {isOrganizer && isLive && (
            <button
              onClick={endEvent}
              style={{ background: "transparent", border: "1px solid #cc3300", color: "#FF3B30", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
            >
              End Event
            </button>
          )}
        </div>
      </div>

      {showShare && (
        <div
          onClick={() => setShowShare(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 540, background: "#0C1E29", border: "1px solid #1E3B4C", borderRadius: 8, padding: 24, color: "#C8D4DC", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>Share this event</h2>
              <button onClick={() => setShowShare(false)} aria-label="Close" style={{ background: "transparent", border: "none", color: "#7E93A0", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>&times;</button>
            </div>

            <div style={shareSection}>
              <div style={shareLabel}>Join code — for riders</div>
              <p style={shareHelp}>Riders enter this code in the app to join the event and start sharing their location.</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ font: "800 26px system-ui", letterSpacing: 4, color: "#CCFF00", background: "#0A0A0A", border: "1px solid #1E3B4C", borderRadius: 6, padding: "10px 16px", flex: 1, textAlign: "center" }}>{event.join_code}</div>
                <button onClick={() => copy(event.join_code, "code-only")} style={modalBtn}>{copyFeedback === "code-only" ? "Copied!" : "Copy"}</button>
              </div>
            </div>

            <div style={shareSection}>
              <div style={shareLabel}>Invite message — {groupNoun}</div>
              <p style={shareHelp}>A ready-to-send note for the riders you're inviting to this {groupNoun}.</p>
              <div style={{ background: "#0A0A0A", border: "1px solid #1E3B4C", borderRadius: 4, padding: "10px 12px", color: "#C8D4DC", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{inviteText}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => copy(inviteText, "invite")} style={modalBtn}>{copyFeedback === "invite" ? "Copied!" : "Copy invite"}</button>
              </div>
            </div>

            <div style={shareSection}>
              <div style={shareLabel}>Public spectator link</div>
              <p style={shareHelp}>Anyone with this link can watch the live map — no account needed.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={publicUrl} style={shareInput} onFocus={(e) => e.currentTarget.select()} />
                <button onClick={() => copy(publicUrl, "pub")} style={modalBtn}>{copyFeedback === "pub" ? "Copied!" : "Copy"}</button>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={modalLinkBtn}>Open</a>
              </div>
            </div>

            <div style={{ ...shareSection, marginBottom: 0, borderBottom: "none" }}>
              <div style={shareLabel}>Embed on your website</div>
              <p style={shareHelp}>Paste this into your event site — the map stays live and updates itself. Adjust width/height to taste.</p>
              <code style={shareCode}>{embedCode}</code>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => copy(embedCode, "embed")} style={modalBtn}>{copyFeedback === "embed" ? "Copied!" : "Copy embed code"}</button>
                <a href={embedUrl} target="_blank" rel="noopener noreferrer" style={modalLinkBtn}>Preview</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#0C1E29", borderBottom: "1px solid #1E3B4C", flexShrink: 0, height: TABS_H }}>
        {(["map", "riders", ...(isOrganizer ? ["admin"] : [])] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "0 24px", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
              border: "none", borderBottom: tab === t ? "2px solid #CCFF00" : "2px solid transparent",
              color: tab === t ? "#CCFF00" : "#7E93A0", background: "transparent", cursor: "pointer",
            }}
          >
            {t === "riders" ? "Entrants" : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── MAP TAB ── */}
      {tab === "map" && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <LiveEventMap shareToken={event.share_token} organizerEventId={isOrganizer ? event.id : undefined} />
        </div>
      )}

      {/* ── RIDERS TAB ── */}
      {tab === "riders" && (
        <div style={{ flex: 1, overflowY: "auto", background: "#0A0A0A" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            {isOrganizer && <EntrantManager eventId={event.id} />}
            {!isOrganizer && (<>
            <SectionLabel>Participants</SectionLabel>
            <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C" }}>
              {riders.length === 0 ? (
                <p style={{ padding: "24px", color: "#7E93A0", fontSize: 13, margin: 0 }}>No riders have joined yet. Share the join code: <strong>{event.join_code}</strong></p>
              ) : riders.map((rider, i) => {
                const color = RIDER_COLORS[i % RIDER_COLORS.length];
                const minsAgo = rider.latest ? Math.round((Date.now() - new Date(rider.latest.recorded_at).getTime()) / 60000) : null;
                return (
                  <div key={rider.id} style={{ padding: "14px 20px", borderBottom: "1px solid #1E3B4C", display: "flex", alignItems: "center", gap: 14, borderLeft: `3px solid ${color}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                      {rider.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
                          {rider.rider_number ? `#${rider.rider_number} ` : ""}{rider.display_name}{rider.role === "organizer" ? " ★" : ""}
                        </p>
                        {rider.rider_class && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#7E93A0", letterSpacing: 0.5, textTransform: "uppercase", border: "1px solid #1E3B4C", padding: "1px 6px" }}>
                            {rider.rider_class}
                          </span>
                        )}
                      </div>
                      {rider.latest ? (
                        <p style={{ fontSize: 12, color: minsAgo !== null && minsAgo > 10 ? "#f59e0b" : "#7E93A0", margin: "2px 0 0" }}>
                          {rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h · {timeAgo(rider.latest.recorded_at)}
                          {rider.latest.altitude_m ? ` · ${Math.round(rider.latest.altitude_m)}m` : ""}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12, color: "#7E93A0", margin: "2px 0 0" }}>No position yet</p>
                      )}
                    </div>
                    {rider.latest && (
                      <Btn border="#1E3B4C" color="#7E93A0" onClick={() => setTab("map")}>
                        Find on Map
                      </Btn>
                    )}
                    {isOrganizer && (
                      <Btn border="#5A2530" color="#FF6B6B" onClick={() => removeRider(rider.id, rider.display_name)}>
                        Remove
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
            </>)}
          </div>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === "admin" && isOrganizer && (
        <div style={{ flex: 1, overflowY: "auto", background: "#0A0A0A" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Branding: event logo + sponsors */}
            <EventBranding eventId={id} />

            {/* Stages */}
            <StagesManager eventId={id} />

            {/* Classes */}
            <div>
              <SectionLabel>Rider Classes</SectionLabel>
              <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: 24 }}>
                <p style={{ fontSize: 13, color: "#7E93A0", margin: "0 0 20px", lineHeight: 1.6 }}>
                  Define the class options riders see when joining this event. If left empty, the class field is hidden on the join screen.
                </p>

                {/* Chips */}
                {(editedClasses ?? []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {(editedClasses ?? []).map((cls) => (
                      <div
                        key={cls}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "#CCFF00", color: "#0C1E29", padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 700 }}
                      >
                        {cls}
                        <button
                          onClick={() => setEditedClasses((prev) => (prev ?? []).filter((c) => c !== cls))}
                          style={{ background: "none", border: "none", color: "#cce0ff", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add input */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <input
                    type="text"
                    value={classInput}
                    onChange={(e) => setClassInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditedClass(); } }}
                    placeholder="e.g. Moto, UTV, Car, Truck…"
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #1E3B4C", fontSize: 14, color: "#FFFFFF", outline: "none" }}
                  />
                  <button
                    onClick={addEditedClass}
                    disabled={!classInput.trim()}
                    style={{
                      background: classInput.trim() ? "#1a2129" : "#1E3B4C", color: "#fff",
                      border: "none", padding: "10px 18px", fontSize: 11, fontWeight: 700,
                      letterSpacing: 0.5, textTransform: "uppercase",
                      cursor: classInput.trim() ? "pointer" : "default",
                    }}
                  >
                    Add
                  </button>
                </div>

                <button
                  onClick={saveClasses}
                  disabled={savingClasses}
                  style={{
                    background: classesSaved ? "#CCFF00" : "#CCFF00", color: "#0C1E29",
                    border: "none", padding: "11px 24px", fontSize: 11, fontWeight: 700,
                    letterSpacing: 0.5, textTransform: "uppercase",
                    cursor: savingClasses ? "default" : "pointer",
                  }}
                >
                  {savingClasses ? "Saving…" : classesSaved ? "Saved ✓" : "Save Classes"}
                </button>
              </div>
            </div>

            {/* Your GEP link */}
            <div>
              <SectionLabel>Your GEP Link</SectionLabel>
              <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C", padding: 20 }}>
                <p style={{ fontSize: 13, color: "#7E93A0", margin: "0 0 14px", lineHeight: 1.6 }}>
                  Open this in Google Earth Pro to see all riders live. Go to Add → Network Link, paste the URL in the Link field. This link is unique to you — do not share it.
                </p>
                {myGepUrl ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      readOnly value={myGepUrl}
                      style={{ flex: 1, padding: "9px 12px", border: "1px solid #1E3B4C", fontSize: 12, color: "#FFFFFF", background: "#0A0A0A", outline: "none" }}
                    />
                    <Btn onClick={() => copy(myGepUrl, "my-gep")} color={copyFeedback === "my-gep" ? "#CCFF00" : "#FFFE15"}>
                      {copyFeedback === "my-gep" ? "Copied!" : "Copy"}
                    </Btn>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "#7E93A0", margin: 0 }}>GEP link not available yet.</p>
                )}
              </div>
            </div>

            {/* GEP Viewers — organizer only */}
            {isOrganizer && (
              <div>
                <SectionLabel>GEP Viewers</SectionLabel>
                <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E3B4C" }}>
                    <p style={{ fontSize: 12, color: "#7E93A0", margin: 0, lineHeight: 1.6 }}>
                      Issue a named KML link to anyone watching in Google Earth Pro — marshals, crew, sponsors. Each link is unique and traceable. Revoking it kills their feed immediately.
                    </p>
                  </div>

                  {credentials.map((cred) => {
                    const url = `${gepBase}/api/events/${event.id}/gep/${cred.gep_token}/network-link.kml`;
                    const copyKey = `cred-${cred.id}`;
                    return (
                      <div key={cred.id} style={{ padding: "12px 20px", borderBottom: "1px solid #1E3B4C", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{cred.display_name}</p>
                          <p style={{ fontSize: 11, color: "#7E93A0", margin: "2px 0 0", fontFamily: "monospace" }}>…{cred.gep_token.slice(-10)}</p>
                        </div>
                        <Btn border="#FFFE15" color="#FFFE15" onClick={() => copy(url, copyKey)}>
                          {copyFeedback === copyKey ? "Copied!" : "Copy Link"}
                        </Btn>
                        <Btn border="#FF3B30" color="#FF3B30" onClick={() => revokeViewer(cred.id, cred.display_name)}>
                          Revoke
                        </Btn>
                      </div>
                    );
                  })}

                  {/* Add viewer */}
                  <div style={{ padding: "16px 20px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#7E93A0", textTransform: "uppercase", margin: "0 0 10px" }}>Add Viewer</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="First Last"
                        value={newViewerName}
                        onChange={(e) => setNewViewerName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addViewer(); }}
                        style={{ flex: 1, padding: "9px 12px", border: "1px solid #1E3B4C", fontSize: 14, color: "#FFFFFF", outline: "none" }}
                      />
                      <Btn onClick={addViewer} disabled={addingViewer || !newViewerName.trim()}>
                        {addingViewer ? "Adding..." : "Add"}
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Access log — organizer only */}
            {isOrganizer && (
              <div>
                <SectionLabel>GEP Access Log</SectionLabel>
                <div style={{ background: "#0C1E29", border: "1px solid #1E3B4C" }}>
                  {accessLog.length === 0 ? (
                    <p style={{ padding: "20px", color: "#7E93A0", fontSize: 13, margin: 0 }}>No GEP accesses yet.</p>
                  ) : accessLog.map((entry, i) => (
                    <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid #1E3B4C", display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>{entry.display_name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "#7E93A0", textTransform: "uppercase", border: "1px solid #1E3B4C", padding: "1px 6px" }}>
                            {entry.type === "credential" ? "GEP Viewer" : entry.role === "organizer" ? "Organizer" : "Rider"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "#7E93A0", margin: "3px 0 0" }}>
                          {entry.access_count} access{entry.access_count !== 1 ? "es" : ""} · {entry.unique_ips.length} IP{entry.unique_ips.length !== 1 ? "s" : ""} · Last: {entry.last_ip}
                        </p>
                        {entry.unique_ips.length > 1 && (
                          <p style={{ fontSize: 11, color: "#d97706", fontWeight: 700, margin: "4px 0 0" }}>
                            ⚠ Multiple IPs — link may have been shared
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#7E93A0", whiteSpace: "nowrap" }}>{entry.access_count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

const shareSection: React.CSSProperties = { paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid #1E3B4C" };
const shareLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7E93A0", marginBottom: 4 };
const shareHelp: React.CSSProperties = { fontSize: 13, color: "#7E93A0", margin: "0 0 10px", lineHeight: 1.5 };
const shareInput: React.CSSProperties = { flex: 1, minWidth: 0, padding: "9px 12px", border: "1px solid #1E3B4C", background: "#0A0A0A", color: "#fff", fontSize: 13, borderRadius: 4, outline: "none" };
const shareCode: React.CSSProperties = { display: "block", background: "#0A0A0A", border: "1px solid #1E3B4C", borderRadius: 4, padding: "10px 12px", color: "#C8D4DC", fontSize: 12, fontFamily: "monospace", wordBreak: "break-all", whiteSpace: "pre-wrap" };
const modalBtn: React.CSSProperties = { background: "#CCFF00", color: "#0C1E29", border: "none", padding: "9px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
const modalLinkBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", background: "transparent", border: "1px solid #3a4550", color: "#C8D4DC", padding: "9px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", borderRadius: 4, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 };
