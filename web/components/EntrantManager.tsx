"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { timeAgo } from "../lib/geo";
import { theme, font, btnPrimary, btnGhost } from "../lib/theme";

interface Entrant {
  id: string;
  display_name: string;
  rider_number: string | null;
  rider_class: string | null;
  device_type: string | null;
  feed_url: string | null;
  feed_id: string | null;
  last_seen_at: string | null;
  last_polled_at: string | null;
  poll_error: string | null;
  gep_token: string | null;
  status: "live" | "stale" | "dark" | "no_fix";
  minutes_since_fix: number | null;
}

interface DryRun {
  would_insert: number;
  would_link?: number;
  unlinked_codes?: string[];
  already_in_event?: string[];
  errors: { line: number; message: string }[];
  duplicates: string[];
  preview: { display_name: string; rider_number: string | null; device_type: string | null }[];
}

const STATUS_STYLE: Record<Entrant["status"], { color: string; label: string }> = {
  live: { color: theme.live, label: "Live" },
  stale: { color: theme.stale, label: "Stale" },
  dark: { color: theme.dark, label: "No signal" },
  no_fix: { color: theme.noFix, label: "No fix yet" },
};

export default function EntrantManager({ eventId }: { eventId: string }) {
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editClassId, setEditClassId] = useState<string | null>(null);
  const [classDraft, setClassDraft] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/events/${eventId}/entrants`);
      if (!res.ok) {
        setError("Could not load the roster");
        return;
      }
      const data = await res.json();
      setEntrants(data.entrants ?? []);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // ── Validate before importing ────────────────────────────────
  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      setPendingFile(file);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", "1");
      const res = await authFetch(`/api/events/${eventId}/entrants/batch`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that file");
        setPendingFile(null);
        return;
      }
      setDryRun(data);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      if (replace) fd.append("replace", "1");
      const res = await authFetch(`/api/events/${eventId}/entrants/batch`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      const parts = [`Imported ${data.inserted} entrant${data.inserted === 1 ? "" : "s"}`];
      if (data.linked) parts.push(`${data.linked} linked to Waypoint account${data.linked === 1 ? "" : "s"}`);
      if (data.already_in_event?.length) parts.push(`${data.already_in_event.length} already in event (left unlinked)`);
      if (data.unlinked_codes?.length) parts.push(`${data.unlinked_codes.length} Waypoint ID${data.unlinked_codes.length === 1 ? "" : "s"} not found`);
      setImportMsg(parts.join(" · "));
      setDryRun(null);
      setPendingFile(null);
      setReplace(false);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from this event?`)) return;
    await authFetch(`/api/events/${eventId}/entrants/${id}`, { method: "DELETE" });
    await load();
  }

  // Inline class edit — organizers fix a class on the fly (mistakes, or a
  // rider switches class last-minute). PATCH merges onto the current row.
  async function saveClass(id: string) {
    const value = classDraft.trim();
    const current = entrants.find((e) => e.id === id)?.rider_class ?? "";
    setEditClassId(null);
    if (value === (current ?? "")) return; // no-op
    setSavingClass(true);
    try {
      const res = await authFetch(`/api/events/${eventId}/entrants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not update the class");
        return;
      }
      setError(null);
      setEntrants((prev) => prev.map((e) => (e.id === id ? { ...e, rider_class: value || null } : e)));
    } finally {
      setSavingClass(false);
    }
  }

  const reporting = entrants.filter((e) => e.status === "live").length;
  const problems = entrants.filter((e) => e.poll_error);

  return (
    <section style={{ font: `14px ${font.sans}`, color: theme.body }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <h2 style={{ font: `700 20px ${font.sans}`, color: theme.ink, margin: 0 }}>
          Entrants
        </h2>
        <span style={{ color: theme.muted }}>
          {entrants.length} on the roster &middot; {reporting} reporting now
        </span>
      </header>

      {/* ── Import ─────────────────────────────────────────── */}
      <div
        style={{
          border: `1px solid ${theme.hairline}`,
          borderRadius: 6,
          padding: 16,
          marginBottom: 20,
          background: theme.surface,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, color: theme.ink }}>Batch load a roster</div>
        <p style={{ margin: "0 0 12px", color: theme.muted, fontSize: 13 }}>
          Upload a <strong>CSV or Excel (.xlsx)</strong> file with columns{" "}
          <code>name, number, class, device, feed</code>. The feed is each entrant&rsquo;s
          public beacon share link — a Garmin MapShare URL or a SPOT feed id. ZOLEO entrants
          need no feed; those units push to us directly. Add an optional{" "}
          <code>waypoint_id</code> column with a rider&rsquo;s Waypoint ID to link their
          account for emergency info.
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            style={{ fontSize: 13 }}
          />
          <a
            href={`/api/events/${eventId}/entrants/batch`}
            style={{ fontSize: 13, color: theme.accent }}
          >
            Download template
          </a>
        </div>

        {dryRun && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              background: theme.canvas,
              border: `1px solid ${theme.hairline}`,
              borderRadius: 4,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, color: theme.ink }}>
              Ready to import {dryRun.would_insert} entrant
              {dryRun.would_insert === 1 ? "" : "s"}
            </div>

            {(dryRun.would_link || dryRun.unlinked_codes?.length || dryRun.already_in_event?.length) ? (
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                {dryRun.would_link ? (
                  <div style={{ color: theme.live }}>
                    🔗 {dryRun.would_link} will link to a Waypoint account
                  </div>
                ) : null}
                {dryRun.already_in_event?.length ? (
                  <div style={{ color: theme.warn }}>
                    {dryRun.already_in_event.length} already in this event — imported unlinked: {dryRun.already_in_event.slice(0, 5).join(", ")}
                    {dryRun.already_in_event.length > 5 ? "…" : ""}
                  </div>
                ) : null}
                {dryRun.unlinked_codes?.length ? (
                  <div style={{ color: theme.muted }}>
                    Waypoint ID{dryRun.unlinked_codes.length === 1 ? "" : "s"} not found: {dryRun.unlinked_codes.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            {dryRun.preview.length > 0 && (
              <div style={{ fontSize: 13, color: theme.muted, marginBottom: 10 }}>
                First few: {dryRun.preview.map((p) => p.display_name).join(", ")}
                {dryRun.would_insert > dryRun.preview.length && "…"}
              </div>
            )}

            {dryRun.errors.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: theme.danger, fontWeight: 600, fontSize: 13 }}>
                  {dryRun.errors.length} row{dryRun.errors.length === 1 ? "" : "s"} will be
                  skipped
                </div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: theme.muted }}>
                  {dryRun.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                  {dryRun.errors.length > 8 && <li>…and {dryRun.errors.length - 8} more</li>}
                </ul>
              </div>
            )}

            {dryRun.duplicates.length > 0 && (
              <div style={{ color: theme.warn, fontSize: 13, marginBottom: 10 }}>
                Duplicate names in the file: {dryRun.duplicates.join(", ")}
              </div>
            )}

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace the current roster (keeps anyone who joined with the event code)
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={confirmImport} disabled={busy || dryRun.would_insert === 0} style={primaryBtn}>
                {busy ? "Importing…" : `Import ${dryRun.would_insert}`}
              </button>
              <button
                onClick={() => {
                  setDryRun(null);
                  setPendingFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                style={secondaryBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: theme.danger, marginBottom: 14 }}>{error}</div>
      )}

      {importMsg && (
        <div style={{ color: theme.live, marginBottom: 14, fontSize: 13, background: theme.canvas, border: `1px solid ${theme.hairline}`, borderRadius: 4, padding: "10px 14px" }}>
          ✓ {importMsg}
        </div>
      )}

      {/* ── Feed problems ──────────────────────────────────── */}
      {problems.length > 0 && (
        <div
          style={{
            border: `1px solid ${theme.danger}55`,
            background: theme.dangerSurface,
            borderRadius: 6,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 600, color: theme.danger, marginBottom: 6 }}>
            {problems.length} feed{problems.length === 1 ? "" : "s"} not responding
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {problems.slice(0, 6).map((p) => (
              <li key={p.id}>
                <strong>{p.display_name}</strong>: {p.poll_error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Roster ─────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: theme.muted }}>Loading roster…</div>
      ) : entrants.length === 0 ? (
        <div style={{ color: theme.muted, padding: "20px 0" }}>
          No entrants yet. Upload a roster CSV above to get started.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: theme.muted, borderBottom: `2px solid ${theme.hairline}` }}>
                <th style={th}>#</th>
                <th style={th}>Name</th>
                <th style={th}>Class</th>
                <th style={th}>Device</th>
                <th style={th}>Status</th>
                <th style={th}>Last fix</th>
                <th style={th}>Google Earth</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {entrants.map((e) => {
                const s = STATUS_STYLE[e.status];
                return (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${theme.hairlineSoft}` }}>
                    <td style={td}>{e.rider_number ?? "—"}</td>
                    <td style={{ ...td, fontWeight: 600, color: theme.ink }}>{e.display_name}</td>
                    <td style={td}>
                      {editClassId === e.id ? (
                        <input
                          autoFocus
                          value={classDraft}
                          disabled={savingClass}
                          onChange={(ev) => setClassDraft(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") saveClass(e.id);
                            if (ev.key === "Escape") setEditClassId(null);
                          }}
                          onBlur={() => saveClass(e.id)}
                          placeholder="Class"
                          style={{ width: 92, font: `13px ${font.sans}`, padding: "3px 6px", background: theme.canvas, color: theme.ink, border: `1px solid ${theme.accent}`, borderRadius: 4 }}
                        />
                      ) : (
                        <button
                          onClick={() => { setEditClassId(e.id); setClassDraft(e.rider_class ?? ""); }}
                          title="Click to edit class"
                          style={{ background: "transparent", border: "none", color: theme.body, cursor: "pointer", font: `13px ${font.sans}`, padding: "2px 4px", borderRadius: 4, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                        >
                          {e.rider_class ?? "—"}
                        </button>
                      )}
                    </td>
                    <td style={td}>{e.device_type ?? "—"}</td>
                    <td style={td}>
                      <span style={{ color: s.color }}>&#9679;</span> {s.label}
                    </td>
                    <td style={td}>{timeAgo(e.last_seen_at)}</td>
                    <td style={td}>
                      {e.gep_token ? (
                        <a
                          href={`/api/events/${eventId}/gep/${e.gep_token}/network-link.kml`}
                          style={{ color: theme.accent }}
                        >
                          KML
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => remove(e.id, e.display_name)}
                        style={{ ...secondaryBtn, padding: "3px 8px", fontSize: 12 }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 10px", whiteSpace: "nowrap" };

const primaryBtn = btnPrimary;
const secondaryBtn = btnGhost;
