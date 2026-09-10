"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { theme, font, text } from "../lib/theme";

/**
 * SOS Incident Command panel (organizer view).
 *
 * Turns an SOS into a timestamped response log: it opens automatically when a
 * rider's device fires, OR the organizer opens one manually when someone else
 * reports it (a buddy rode out for signal). Each response milestone is one tap
 * that stamps the time, the operator, and an optional note (typed or dictated).
 * A running clock shows elapsed time; "Download report" prints a timestamped
 * PDF for responders or insurers.
 *
 * Reads/writes go through RLS + the open_sos_incident / log_sos_event RPCs
 * (migrations 037/038), so only the event's organizer can see or act on these.
 */

type Roster = { id: string; name: string; number?: string | null }[];

type Incident = {
  id: string; participant_id: string; opened_at: string; resolved_at: string | null;
  status: string; source: string | null; reported_by: string | null;
  trigger_lat: number | null; trigger_lng: number | null;
  ice_snapshot: { name?: string; number?: string; ice_name?: string; ice_phone?: string; blood_type?: string; allergies?: string } | null;
};
type LogRow = { id: number; incident_id: string; kind: string; at: string; note: string | null };

const MILESTONES: [string, string][] = [
  ["acknowledge", "Acknowledge"],
  ["dispatch", "Dispatch"],
  ["medic_onsite", "Medic on site"],
  ["helo_requested", "Helo requested"],
  ["helo_onsite", "Helo on site"],
  ["recovery_dispatched", "Recovery dispatched"],
  ["recovery_onsite", "Recovery on site"],
];
const KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(MILESTONES), resolved: "Resolved", note: "Note",
};

export default function SosIncidentPanel({ eventId, roster, onLocate }: { eventId: string; roster: Roster; onLocate?: (participantId: string) => void }) {
  const supabase = getSupabaseClient();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [logs, setLogs] = useState<Record<string, LogRow[]>>({});
  const [reporting, setReporting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: inc } = await supabase
      .from("sos_incidents").select("*").eq("event_id", eventId)
      .order("opened_at", { ascending: false });
    const list = (inc ?? []) as Incident[];
    setIncidents(list);
    const open = list.filter((i) => i.status === "open");
    if (open.length) {
      const { data: rows } = await supabase
        .from("sos_incident_log").select("*")
        .in("incident_id", open.map((i) => i.id))
        .order("at", { ascending: true });
      const byId: Record<string, LogRow[]> = {};
      (rows ?? []).forEach((r) => { (byId[(r as LogRow).incident_id] ??= []).push(r as LogRow); });
      setLogs(byId);
    }
  }, [supabase, eventId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const open = incidents.filter((i) => i.status === "open");

  // Auto-expand a single incident; when several are active, keep them collapsed
  // to compact rows (triage view) but keep the current selection if still open,
  // otherwise open the newest so a just-arrived SOS surfaces.
  useEffect(() => {
    if (open.length === 0) { if (expandedId) setExpandedId(null); return; }
    if (open.length === 1) { setExpandedId(open[0].id); return; }
    if (!expandedId || !open.some((i) => i.id === expandedId)) setExpandedId(open[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ font: `800 ${text.lg}px ${font.sans}`, color: theme.ink, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⛑ Incident command</span>
          {open.length > 0 && (
            <span style={{ background: theme.danger, color: "#fff", borderRadius: 20, padding: "2px 9px", font: `800 ${text.xs}px ${font.sans}` }}>{open.length} active</span>
          )}
        </div>
        <button onClick={() => setReporting((v) => !v)} style={{ ...btnDanger }}>
          {reporting ? "Cancel" : "＋ Report SOS for a rider"}
        </button>
      </div>

      {reporting && <ReportForm roster={roster} onDone={() => { setReporting(false); refresh(); }} />}

      {open.length === 0 && !reporting && (
        <div style={{ color: theme.muted, font: `${text.md}px/1.5 ${font.sans}`, padding: "8px 0" }}>
          No active incidents. If a device fires an SOS it opens here automatically — or use “Report SOS” when someone calls one in.
        </div>
      )}

      {open.length > 1 && (
        <div style={{ color: theme.muted, font: `700 ${text.xs}px ${font.sans}`, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {open.length} incidents — tap one to open
        </div>
      )}
      {open.map((inc) => (
        <IncidentCard
          key={inc.id}
          inc={inc}
          log={logs[inc.id] ?? []}
          expanded={expandedId === inc.id}
          onToggle={() => setExpandedId((cur) => (cur === inc.id ? null : inc.id))}
          onLocate={onLocate}
          onChange={refresh}
        />
      ))}
    </div>
  );
}

function ReportForm({ roster, onDone }: { roster: Roster; onDone: () => void }) {
  const supabase = getSupabaseClient();
  const [pid, setPid] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!pid) return;
    setBusy(true);
    await supabase.rpc("open_sos_incident", {
      p_participant_id: pid, p_source: "manual",
      p_reported_by: reportedBy.trim() || null, p_note: note.trim() || null,
    });
    setBusy(false);
    onDone();
  }

  return (
    <div style={{ background: theme.dangerSurface, border: `1px solid ${theme.danger}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ font: `800 ${text.sm}px ${font.sans}`, color: theme.ink, letterSpacing: 0.3 }}>Open an incident for a rider</div>
      <select value={pid} onChange={(e) => setPid(e.target.value)} style={inp}>
        <option value="">Select rider…</option>
        {roster.map((r) => <option key={r.id} value={r.id}>{r.number ? `#${r.number} — ` : ""}{r.name}</option>)}
      </select>
      <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Reported by (e.g. #14 rider, race control call)" style={inp} />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Location / situation — e.g. ~2 mi past WP4, in the wash, conscious" rows={2} style={{ ...inp, resize: "vertical" }} />
      <button onClick={open} disabled={!pid || busy} style={{ ...btnDanger, opacity: !pid || busy ? 0.5 : 1 }}>
        {busy ? "Opening…" : "Open incident"}
      </button>
    </div>
  );
}

function IncidentCard({ inc, log, expanded, onToggle, onLocate, onChange }: { inc: Incident; log: LogRow[]; expanded: boolean; onToggle: () => void; onLocate?: (participantId: string) => void; onChange: () => void }) {
  const supabase = getSupabaseClient();
  const [note, setNote] = useState("");
  const [showIce, setShowIce] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [copied, setCopied] = useState(false);

  function copyCoords() {
    if (inc.trigger_lat == null || inc.trigger_lng == null) return;
    navigator.clipboard?.writeText(`${inc.trigger_lat}, ${inc.trigger_lng}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  // Running clock since the SOS opened.
  useEffect(() => {
    const tick = () => {
      const ms = Date.now() - new Date(inc.opened_at).getTime();
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      const h = Math.floor(m / 60);
      setElapsed(h > 0 ? `${h}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`);
    };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [inc.opened_at]);

  const done = useMemo(() => new Set(log.map((l) => l.kind)), [log]);

  async function logKind(kind: string, withNote?: string) {
    setBusy(kind);
    await supabase.rpc("log_sos_event", { p_incident_id: inc.id, p_kind: kind, p_note: withNote ?? null });
    setBusy(null);
    if (kind === "note") setNote("");
    onChange();
  }

  const ice = inc.ice_snapshot ?? {};
  const coords = inc.trigger_lat != null && inc.trigger_lng != null
    ? `${inc.trigger_lat.toFixed(5)}, ${inc.trigger_lng.toFixed(5)}` : "—";

  return (
    <div style={{ border: `2px solid ${theme.danger}`, borderRadius: 12, overflow: "hidden", background: theme.surface }}>
      <div onClick={onToggle} role="button" tabIndex={0} style={{ background: theme.danger, color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", cursor: "pointer" }}>
        <div style={{ font: `800 ${text.lg}px ${font.sans}` }}>
          ⛑ {ice.number ? `#${ice.number} ` : ""}{ice.name || "Rider"}
          {inc.source === "manual" && <span style={{ font: `700 ${text.xs}px ${font.sans}`, opacity: 0.85 }}>  · reported{inc.reported_by ? ` by ${inc.reported_by}` : ""}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ font: `800 ${text.md}px ${font.mono}` }}>⏱ {elapsed}</span>
          <span style={{ font: `700 14px ${font.sans}`, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </div>
      </div>

      {/* Collapsed triage summary — latest action, or an unacknowledged warning */}
      {!expanded && (
        <div onClick={onToggle} role="button" tabIndex={0} style={{ padding: "9px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", font: `${text.sm}px ${font.sans}`, color: theme.body }}>
          {done.has("acknowledge") ? (
            <>
              <span style={{ color: theme.track, fontWeight: 800 }}>{KIND_LABEL[log[log.length - 1]?.kind] ?? "Open"}</span>
              <span style={{ color: theme.muted, fontFamily: font.mono }}>{log.length ? new Date(log[log.length - 1].at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              {log[log.length - 1]?.note && <span style={{ color: theme.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log[log.length - 1].note}</span>}
            </>
          ) : (
            <span style={{ color: theme.warn, fontWeight: 800 }}>⚠ Not acknowledged — tap to open</span>
          )}
        </div>
      )}

      {expanded && (
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Facts */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", font: `${text.sm}px ${font.sans}`, color: theme.body }}>
          <span><b style={{ color: theme.muted }}>SOS: </b>{new Date(inc.opened_at).toLocaleString()}</span>
          <span><b style={{ color: theme.muted }}>Coords: </b><span style={{ fontFamily: font.mono, color: theme.track }}>{coords}</span></span>
          {inc.trigger_lat != null && (
            <button onClick={copyCoords} style={chip}>{copied ? "✓ Copied" : "⧉ Copy"}</button>
          )}
          {onLocate && (
            <button onClick={() => onLocate(inc.participant_id)} style={chip}>◎ Show on map</button>
          )}
          {inc.trigger_lat != null && (
            <a href={`https://www.google.com/maps?q=${inc.trigger_lat},${inc.trigger_lng}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4DA6FF" }}>Open in Maps ↗</a>
          )}
        </div>

        {/* ICE behind a tap (access-conscious) */}
        <div>
          <button onClick={() => setShowIce((v) => !v)} style={btnGhost}>{showIce ? "Hide medical info" : "Show medical info"}</button>
          {showIce && (
            <div style={{ marginTop: 8, background: theme.canvas, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, font: `${text.sm}px ${font.sans}` }}>
              <Fact label="Blood" value={ice.blood_type} accent />
              <Fact label="Allergies" value={ice.allergies} />
              <Fact label="ICE contact" value={ice.ice_name} />
              <Fact label="ICE phone" value={ice.ice_phone} accent />
            </div>
          )}
        </div>

        {/* Milestone buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MILESTONES.map(([kind, label]) => (
            <button key={kind} onClick={() => logKind(kind)} disabled={busy === kind}
              style={{ ...btnMilestone, ...(done.has(kind) ? doneStyle : {}) }}>
              {done.has(kind) ? "✓ " : ""}{label}
            </button>
          ))}
        </div>

        {/* Note (typed or dictated) */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (type or use your keyboard mic)…" rows={2} style={{ ...inp, flex: 1, resize: "vertical" }} />
          <MicButton onText={(t) => setNote((p) => (p ? p + " " : "") + t)} />
          <button onClick={() => note.trim() && logKind("note", note.trim())} disabled={!note.trim()} style={{ ...btnGhost, opacity: note.trim() ? 1 : 0.5 }}>Add</button>
        </div>

        {/* Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {log.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 10, font: `${text.sm}px ${font.sans}`, padding: "5px 0", borderBottom: `1px solid ${theme.hairlineSoft}` }}>
              <span style={{ fontFamily: font.mono, color: theme.muted, flexShrink: 0, minWidth: 78 }}>{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              <span style={{ fontWeight: 800, color: theme.track, flexShrink: 0, minWidth: 130 }}>{KIND_LABEL[l.kind] ?? l.kind}</span>
              <span style={{ color: theme.body }}>{l.note}</span>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
          <button onClick={() => printReport(inc, log)} style={btnGhost}>↓ Download report (PDF)</button>
          <button onClick={() => { if (confirm("Mark this incident resolved?")) logKind("resolved", "Incident resolved"); }} style={btnPrimary}>Resolve incident</button>
        </div>
      </div>
      )}
    </div>
  );
}

function Fact({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ color: theme.muted, font: `700 ${text.xxs}px ${font.sans}`, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ color: accent ? theme.track : theme.ink, font: `${accent ? 800 : 600} ${text.md}px ${font.sans}` }}>{value || "—"}</div>
    </div>
  );
}

// Web Speech API mic (desktop); on mobile the native keyboard mic already works.
function MicButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const recRef = useRef<any>(null);
  const supported = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  if (!supported) return null;
  function toggle() {
    if (on) { recRef.current?.stop(); setOn(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e: any) => onText(e.results[e.results.length - 1][0].transcript.trim());
    rec.onend = () => setOn(false);
    rec.start(); recRef.current = rec; setOn(true);
  }
  return (
    <button onClick={toggle} title="Dictate" style={{ ...btnGhost, background: on ? theme.danger : "transparent", color: on ? "#fff" : theme.body }}>🎙</button>
  );
}

// Print a standalone, timestamped incident report (save as PDF from the print dialog).
function printReport(inc: Incident, log: LogRow[]) {
  const ice = inc.ice_snapshot ?? {};
  const rows = log.map((l) =>
    `<tr><td style="font-family:monospace;color:#555;padding:4px 12px 4px 0;white-space:nowrap">${new Date(l.at).toLocaleString()}</td>
     <td style="font-weight:700;padding:4px 12px 4px 0">${KIND_LABEL[l.kind] ?? l.kind}</td>
     <td style="padding:4px 0">${escapeHtml(l.note ?? "")}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Incident report</title></head>
  <body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px">
    <div style="border-bottom:3px solid #FF3B30;padding-bottom:8px;margin-bottom:16px">
      <div style="font-weight:800;font-size:22px;color:#FF3B30">SOS INCIDENT REPORT</div>
      <div style="color:#666;font-size:12px">Waypoint · generated ${new Date().toLocaleString()}</div>
    </div>
    <table style="font-size:14px;margin-bottom:16px"><tbody>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Rider</td><td>${escapeHtml((ice.number ? "#" + ice.number + " " : "") + (ice.name ?? ""))}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">SOS time</td><td>${new Date(inc.opened_at).toLocaleString()}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Reported</td><td>${inc.source === "manual" ? "Manual" + (inc.reported_by ? " — by " + escapeHtml(inc.reported_by) : "") : "Device"}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Coordinates</td><td>${inc.trigger_lat != null ? inc.trigger_lat + ", " + inc.trigger_lng : "—"}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Resolved</td><td>${inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : "Open"}</td></tr>
    </tbody></table>
    <div style="font-weight:800;margin:14px 0 6px">Medical (ICE)</div>
    <table style="font-size:14px;margin-bottom:16px"><tbody>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Blood type</td><td>${escapeHtml(ice.blood_type ?? "—")}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">Allergies</td><td>${escapeHtml(ice.allergies ?? "—")}</td></tr>
      <tr><td style="color:#666;padding:2px 12px 2px 0">ICE contact</td><td>${escapeHtml((ice.ice_name ?? "") + (ice.ice_phone ? " — " + ice.ice_phone : "") || "—")}</td></tr>
    </tbody></table>
    <div style="font-weight:800;margin:14px 0 6px">Response timeline</div>
    <table style="font-size:13px;width:100%"><tbody>${rows || '<tr><td style="color:#999">No entries.</td></tr>'}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to download the report."); return; }
  w.document.write(html); w.document.close();
  w.focus(); setTimeout(() => w.print(), 300);
}
function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

// ── styles ──────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", background: theme.canvas, color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: "9px 11px", font: `600 ${text.md}px ${font.sans}`, outline: "none", boxSizing: "border-box" };
const btnDanger: React.CSSProperties = { background: theme.danger, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", font: `800 ${text.sm}px ${font.sans}`, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { background: theme.track, color: theme.accentInk, border: "none", borderRadius: 8, padding: "9px 16px", font: `800 ${text.sm}px ${font.sans}`, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "transparent", color: theme.body, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: "9px 13px", font: `700 ${text.sm}px ${font.sans}`, cursor: "pointer" };
const btnMilestone: React.CSSProperties = { background: theme.surfaceHi, color: theme.body, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: "9px 12px", font: `700 ${text.sm}px ${font.sans}`, cursor: "pointer" };
const chip: React.CSSProperties = { background: theme.surfaceHi, color: theme.body, border: `1px solid ${theme.hairline}`, borderRadius: 20, padding: "4px 10px", font: `700 ${text.xs}px ${font.sans}`, cursor: "pointer" };
const doneStyle: React.CSSProperties = { background: "#123", color: theme.track, borderColor: theme.track };
