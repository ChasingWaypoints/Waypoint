"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";

interface Stage {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

/**
 * Organizer stage library. Upload a GPX per day/stage with a name, then
 * pick the active one — activating mirrors that route onto the event so
 * every map and GEP feed shows it. Lives in the event Admin tab.
 */
export default function StagesManager({ eventId }: { eventId: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/events/${eventId}/stages`);
    if (res.ok) {
      const d = await res.json();
      setStages(d.stages ?? []);
      setActiveId(d.active_stage_id ?? null);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function upload() {
    if (!file) { setError("Choose a .gpx file first"); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    if (name.trim()) fd.append("name", name.trim());
    const res = await authFetch(`/api/events/${eventId}/stages`, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "Upload failed"); return; }
    setName(""); setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    await load();
  }

  async function activate(id: string) {
    const res = await authFetch(`/api/events/${eventId}/stages/${id}`, { method: "POST" });
    if (res.ok) setActiveId(id);
  }

  async function remove(id: string, n: string) {
    if (!confirm(`Delete stage "${n}"?`)) return;
    const res = await authFetch(`/api/events/${eventId}/stages/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <p style={label}>Stages</p>
      <p style={{ fontSize: 13, color: "#7E93A0", margin: "0 0 12px", lineHeight: 1.5 }}>
        Upload a GPX per day or special stage and name each one. Select a stage to make it the
        active route — it shows on every map and in all Google Earth Pro feeds.
      </p>

      {stages.length > 0 && (
        <div style={{ border: "1px solid #1E3B4C", borderRadius: 4, marginBottom: 14, overflow: "hidden" }}>
          {stages.map((st) => {
            const active = st.id === activeId;
            return (
              <div key={st.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                borderBottom: "1px solid #14303F",
                background: active ? "#14303F" : "transparent",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: active ? "#CCFF00" : "#54697A",
                }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff" }}>{st.name}</span>
                {active ? (
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#CCFF00" }}>
                    Active
                  </span>
                ) : (
                  <button onClick={() => activate(st.id)} style={selectBtn}>Select</button>
                )}
                <button onClick={() => remove(st.id, st.name)} style={delBtn}>Remove</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ border: "1px solid #1E3B4C", borderRadius: 4, padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stage name — e.g. Day 1: Ensenada → San Felipe"
            style={{ ...input, flex: "1 1 240px" }}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".gpx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13, color: "#C8D4DC" }}
          />
          <button onClick={upload} disabled={busy} style={addBtn}>
            {busy ? "Uploading…" : "Add Stage"}
          </button>
        </div>
        {error && <p style={{ color: "#FF3B30", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
      </div>
    </section>
  );
}

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0",
  textTransform: "uppercase", margin: "0 0 8px",
};
const input: React.CSSProperties = {
  background: "#0A0A0A", color: "#fff", border: "1px solid #1E3B4C",
  borderRadius: 4, padding: "9px 11px", fontSize: 13,
};
const addBtn: React.CSSProperties = {
  background: "#CCFF00", color: "#0C1E29", border: "none", borderRadius: 4,
  padding: "9px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", cursor: "pointer",
};
const selectBtn: React.CSSProperties = {
  background: "transparent", color: "#CCFF00", border: "1px solid #CCFF00",
  borderRadius: 4, padding: "5px 12px", fontSize: 11, fontWeight: 700,
  letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
};
const delBtn: React.CSSProperties = {
  background: "transparent", color: "#7E93A0", border: "1px solid #1E3B4C",
  borderRadius: 4, padding: "5px 10px", fontSize: 11, fontWeight: 700,
  letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
};
