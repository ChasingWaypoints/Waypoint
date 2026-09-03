"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string;
  visible: boolean;
  waypoints?: { name: string }[];
  created_at: string;
}

// Six distinct route colours that read well on satellite imagery.
const COLORS = ["#CCFF00", "#00E5FF", "#FF3B7B", "#FF9500", "#B388FF", "#FFFE15"];

/**
 * Organizer stage library. Upload a GPX per day/stage with a name, toggle
 * each on or off on the map, and pick a colour. Every visible stage is
 * drawn in its colour on all shared maps.
 */
export default function StagesManager({ eventId }: { eventId: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/events/${eventId}/stages`);
    if (res.ok) setStages((await res.json()).stages ?? []);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function upload() {
    if (!file) { setError("Choose a .gpx, .kml, or .kmz file first"); return; }
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

  async function patch(id: string, body: { visible?: boolean; color?: string }) {
    // optimistic
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...body } : s)));
    await authFetch(`/api/events/${eventId}/stages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function remove(id: string, n: string) {
    if (!confirm(`Delete stage "${n}"?`)) return;
    const res = await authFetch(`/api/events/${eventId}/stages/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <section>
      <p style={label}>Stages</p>
      <p style={{ fontSize: 13, color: "#7E93A0", margin: "0 0 12px", lineHeight: 1.5 }}>
        Upload a <strong>GPX, KML, or KMZ</strong> per day or special stage and name it. OpenRally
        GPX files bring their named waypoints in automatically. Toggle each stage on or off, give it
        a colour — every visible stage draws in its colour with its waypoint pins on all maps.
      </p>

      {stages.length > 0 && (
        <div style={{ border: "1px solid #1E3B4C", borderRadius: 4, marginBottom: 14, overflow: "hidden" }}>
          {stages.map((st) => (
            <div key={st.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              borderBottom: "1px solid #14303F",
              background: st.visible ? "#14303F" : "transparent",
            }}>
              {/* visibility toggle */}
              <button
                onClick={() => patch(st.id, { visible: !st.visible })}
                title={st.visible ? "Shown on map — click to hide" : "Hidden — click to show"}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: st.visible ? "#CCFF00" : "#1E3B4C", position: "relative", flexShrink: 0,
                  transition: "background .15s",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: st.visible ? 21 : 3, width: 18, height: 18,
                  borderRadius: "50%", background: st.visible ? "#0C1E29" : "#7E93A0", transition: "left .15s",
                }} />
              </button>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: st.visible ? "#fff" : "#7E93A0" }}>{st.name}</span>
                {st.waypoints && st.waypoints.length > 0 && (
                  <span style={{ fontSize: 11, color: "#7E93A0", marginLeft: 8 }}>
                    {st.waypoints.length} waypoint{st.waypoints.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>

              {/* colour swatches */}
              <div style={{ display: "flex", gap: 5 }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => patch(st.id, { color: c })}
                    title={c}
                    style={{
                      width: 18, height: 18, borderRadius: "50%", cursor: "pointer", background: c,
                      border: st.color?.toLowerCase() === c.toLowerCase() ? "2px solid #fff" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>

              <button onClick={() => remove(st.id, st.name)} style={delBtn}>Remove</button>
            </div>
          ))}
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
            accept=".gpx,.kml,.kmz"
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
const delBtn: React.CSSProperties = {
  background: "transparent", color: "#7E93A0", border: "1px solid #1E3B4C",
  borderRadius: 4, padding: "5px 10px", fontSize: 11, fontWeight: 700,
  letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
};
