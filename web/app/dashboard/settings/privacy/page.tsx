"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";
import { getSupabaseClient } from "@/lib/supabase/client";
import { theme, font } from "../../../../lib/theme";

/**
 * Privacy zones — circles the user marks (home, work) inside which their live
 * position is masked. The masking is applied server-side already; this is the
 * front end plus direct CRUD (RLS restricts rows to the owner).
 */

interface Zone {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
}

// GeoJSON polygon approximating a circle (radius in miles) for the map preview.
function circle(lng: number, lat: number, miles: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const km = miles * 1.609344;
  const points = 64;
  const coords: [number, number][] = [];
  const dLat = km / 110.574;
  const dLng = km / (111.320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

export default function PrivacyZonesPage() {
  const supabase = getSupabaseClient();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(0.5);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;

  async function loadZones(userId: string) {
    const { data } = await supabase.from("privacy_zones").select("id, name, center_lat, center_lng, radius_miles").eq("user_id", userId).order("name");
    setZones(data ?? []);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { window.location.href = "/auth/login"; return; }
      setUid(session.user.id);
      loadZones(session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!container.current || map.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    mapboxgl.accessToken = token;
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-117.0, 32.6],
      zoom: 8,
    });
    map.current = m;
    m.on("load", () => {
      m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "draft-fill", type: "fill", source: "draft", paint: { "fill-color": "#FFFE15", "fill-opacity": 0.18 } });
      m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#FFFE15", "line-width": 2 } });
    });
    m.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      setCenter({ lat, lng });
      if (!marker.current) marker.current = new mapboxgl.Marker({ color: "#FFFE15" });
      marker.current.setLngLat([lng, lat]).addTo(m);
      const src = m.getSource("draft") as mapboxgl.GeoJSONSource | undefined;
      src?.setData(circle(lng, lat, radiusRef.current));
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  // Redraw the draft circle when the radius changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !center) return;
    const src = m.getSource("draft") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(circle(center.lng, center.lat, radius));
  }, [radius, center]);

  async function saveZone() {
    if (!uid || !center || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("privacy_zones").insert({
      user_id: uid, name: name.trim(), center_lat: center.lat, center_lng: center.lng, radius_miles: radius,
    });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setName(""); setCenter(null);
    marker.current?.remove(); marker.current = null;
    const src = map.current?.getSource("draft") as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: [] });
    loadZones(uid);
  }

  async function deleteZone(id: string) {
    if (!uid) return;
    if (!confirm("Delete this privacy zone? Your position will no longer be masked there.")) return;
    await supabase.from("privacy_zones").delete().eq("id", id);
    loadZones(uid);
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.canvas, color: theme.body, font: `14px ${font.sans}` }}>
      <nav style={{ background: theme.surface, borderBottom: `1px solid ${theme.hairline}`, padding: "0 16px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: theme.ink, fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>Waypoint</span>
        <Link href="/dashboard/profile" style={{ color: theme.muted, fontSize: 12, textDecoration: "none" }}>← Profile</Link>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: theme.muted, textTransform: "uppercase", margin: "0 0 4px" }}>Settings</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.ink, margin: "0 0 8px" }}>Privacy zones</h1>
        <p style={{ fontSize: 13, color: theme.muted, lineHeight: 1.6, margin: "0 0 20px", maxWidth: 620 }}>
          Mark a circle around a place you want kept private — home, work. While you&apos;re inside it, your live position is hidden from shared maps. Click the map to set a center, set a radius, and save.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", marginBottom: 24 }}>
          <div ref={container} style={{ width: "100%", height: 320, borderRadius: 8, overflow: "hidden", border: `1px solid ${theme.hairline}` }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zone name (e.g. Home)"
              style={{ flex: "1 1 180px", background: theme.surface, color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 4, padding: "10px 12px", fontSize: 14 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.muted }}>
              Radius
              <input type="number" min={0.1} max={25} step={0.1} value={radius} onChange={(e) => setRadius(Math.max(0.1, Number(e.target.value) || 0.5))}
                style={{ width: 72, background: theme.surface, color: theme.ink, border: `1px solid ${theme.hairline}`, borderRadius: 4, padding: "10px", fontSize: 14, textAlign: "center" }} />
              mi
            </label>
            <button onClick={saveZone} disabled={!center || !name.trim() || saving}
              style={{ background: center && name.trim() ? theme.track : theme.hairline, color: center && name.trim() ? theme.accentInk : theme.muted, border: "none", borderRadius: 6, padding: "10px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: center && name.trim() ? "pointer" : "default" }}>
              {saving ? "Saving…" : "Save zone"}
            </button>
            {center && <span style={{ fontSize: 12, color: theme.muted }}>{center.lat.toFixed(4)}, {center.lng.toFixed(4)}</span>}
          </div>
        </div>

        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: theme.muted, margin: "0 0 10px" }}>Your zones</h2>
        {zones.length === 0 ? (
          <div style={{ background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8, padding: 20, color: theme.muted, fontSize: 13 }}>No privacy zones yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: theme.hairline, border: `1px solid ${theme.hairline}`, borderRadius: 8, overflow: "hidden" }}>
            {zones.map((z) => (
              <div key={z.id} style={{ background: theme.surface, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ color: theme.ink, fontWeight: 700 }}>{z.name}</div>
                  <div style={{ color: theme.muted, fontSize: 12 }}>{z.radius_miles} mi · {z.center_lat.toFixed(4)}, {z.center_lng.toFixed(4)}</div>
                </div>
                <button onClick={() => deleteZone(z.id)} style={{ background: "transparent", color: theme.danger, border: `1px solid ${theme.danger}`, borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
