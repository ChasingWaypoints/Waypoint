"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
// @ts-ignore
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const supabase = getSupabaseClient();

const RIDER_COLORS = [
  "#1c69d4", "#00aa44", "#cc3300", "#cc00aa",
  "#0099cc", "#ff6600", "#006699", "#cc6600",
];

interface TrackPoint { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }
interface Rider { id: string; display_name: string; role: string; rider_class: string | null; rider_number: string | null; latest: TrackPoint | null; track: TrackPoint[] }
interface GepCredential { id: string; display_name: string; gep_token: string; created_at: string }
interface AccessEntry { display_name: string; type: string; role?: string; access_count: number; last_seen: string; unique_ips: string[]; last_ip: string }
interface EventDetail {
  id: string; name: string; status: string; join_code: string; share_token: string;
  route_gpx: string | null; route_name: string | null; organizer_id: string;
  rider_classes: string[];
}

type Tab = "map" | "riders" | "gep" | "settings";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function gpxToCoords(gpx: string): [number, number][] {
  const m = [...gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)];
  if (m.length) return m.map((x) => [parseFloat(x[2]), parseFloat(x[1])]);
  const m2 = [...gpx.matchAll(/<trkpt\s+lon="([^"]+)"\s+lat="([^"]+)"/g)];
  return m2.map((x) => [parseFloat(x[1]), parseFloat(x[2])]);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 10px" }}>
      {children}
    </p>
  );
}

function Btn({ onClick, color = "#1c69d4", border, children, disabled }: {
  onClick?: () => void; color?: string; border?: string;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: border ? "transparent" : (disabled ? "#d4d4d4" : color),
        color: border ? color : "#fff",
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
  const [gpxUploading, setGpxUploading] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement>(null);

  // Settings tab — class editor
  const [classInput, setClassInput] = useState("");
  const [editedClasses, setEditedClasses] = useState<string[] | null>(null); // null = not yet opened
  const [savingClasses, setSavingClasses] = useState(false);
  const [classesSaved, setClassesSaved] = useState(false);

  // Map refs
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const hasInitialFitRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [followId, setFollowId] = useState<string | null>(null);

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
    if (tab === "gep" && session && isOrganizer) {
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

  // Init map
  useEffect(() => {
    if (!event || !mapContainer.current || mapRef.current || tab !== "map") return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-105, 40], zoom: 4,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => setMapReady(true));
    return () => { map.remove(); mapRef.current = null; setMapReady(false); hasInitialFitRef.current = false; };
  }, [event, tab]);

  // Sync riders + route to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !event) return;

    // GPX route
    if (event.route_gpx) {
      const coords = gpxToCoords(event.route_gpx);
      if (coords.length > 1) {
        const src = map.getSource("planned-route") as mapboxgl.GeoJSONSource | undefined;
        const data = { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: {} };
        if (src) { src.setData(data); }
        else {
          map.addSource("planned-route", { type: "geojson", data });
          map.addLayer({ id: "planned-route", type: "line", source: "planned-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 3, "line-dasharray": [2, 2] } });
        }
      }
    }

    const allCoords: [number, number][] = [];

    riders.forEach((rider, i) => {
      const color = RIDER_COLORS[i % RIDER_COLORS.length];
      if (rider.track.length > 1) {
        const coords: [number, number][] = rider.track.map((p) => [p.lng, p.lat]);
        const srcId = `track-${rider.id}`;
        const src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
        const data = { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: {} };
        if (src) { src.setData(data); }
        else {
          map.addSource(srcId, { type: "geojson", data });
          map.addLayer({ id: srcId, type: "line", source: srcId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": color, "line-width": 2.5 } });
        }
      }
      if (rider.latest) {
        const lngLat: [number, number] = [rider.latest.lng, rider.latest.lat];
        allCoords.push(lngLat);
        if (markersRef.current[rider.id]) {
          markersRef.current[rider.id].setLngLat(lngLat);
        } else {
          const el = document.createElement("div");
          el.style.cssText = `width:36px;height:36px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;cursor:pointer;font-family:system-ui;`;
          el.textContent = rider.display_name.slice(0, 2).toUpperCase();
          const popup = new mapboxgl.Popup({ offset: 20 }).setHTML(
            `<strong>${rider.display_name}</strong><br/>${rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h · ${timeAgo(rider.latest.recorded_at)}`
          );
          const marker = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map);
          markersRef.current[rider.id] = marker;
        }
        if (followId === rider.id) map.easeTo({ center: lngLat, duration: 800 });
      }
    });

    // Only fit bounds once — on the first refresh that has positions.
    // Subsequent 20s auto-refreshes must NOT reset the zoom.
    if (allCoords.length && !hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      if (allCoords.length === 1) { map.flyTo({ center: allCoords[0], zoom: 12 }); }
      else {
        const lngs = allCoords.map(c => c[0]); const lats = allCoords.map(c => c[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 14, duration: 1000 });
      }
    }
  }, [riders, event, mapReady, followId]);

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

  async function uploadGpx(file: File) {
    if (!session) return;
    setGpxUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("route_name", file.name.replace(/\.gpx$/i, ""));
    const res = await fetch(`/api/events/${id}/route-gpx`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    if (res.ok) await load();
    setGpxUploading(false);
  }

  async function removeGpx() {
    if (!session || !confirm("Remove planned route?")) return;
    await fetch(`/api/events/${id}/route-gpx`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await load();
  }

  // Initialize editedClasses when Settings tab is opened
  function openSettings() {
    if (editedClasses === null && event) setEditedClasses(event.rider_classes ?? []);
    setTab("settings");
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
      <p style={{ color: "#6b6b6b" }}>Loading event...</p>
    </div>
  );
  if (!event) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#cc3300" }}>Event not found.</p>
    </div>
  );

  const isLive = event.status === "active";
  const gepBase = typeof window !== "undefined" ? window.location.origin : "";
  const myGepUrl = myGepToken ? `${gepBase}/api/events/${event.id}/gep/${myGepToken}/network-link.kml` : null;

  const NAV_H = 48;
  const HEADER_H = 56;
  const TABS_H = 40;
  const contentH = `calc(100vh - ${NAV_H + HEADER_H + TABS_H}px)`;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>

      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 24px", height: NAV_H, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>Waypoint</Link>
        <Link href="/dashboard" style={{ color: "#8a9ab0", fontSize: 12, textDecoration: "none" }}>← Dashboard</Link>
      </nav>

      {/* Event header */}
      <div style={{ background: "#222d38", padding: "0 24px", height: HEADER_H, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isLive && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />}
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{event.name}</h1>
            <p style={{ fontSize: 11, color: "#8a9ab0", margin: 0 }}>
              Join code: <strong style={{ color: "#fff", letterSpacing: 1 }}>{event.join_code}</strong>
              {" · "}{riders.length} rider{riders.length !== 1 ? "s" : ""}
              {" · "}<span style={{ color: isLive ? "#22c55e" : "#6b6b6b", fontWeight: 700, textTransform: "uppercase" }}>{event.status}</span>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => copy(`Join code: ${event.join_code}\n\nFollow live: ${gepBase}/event/${event.share_token}`, "join-code")}
            style={{ background: "transparent", border: "1px solid #3a4550", color: copyFeedback === "join-code" ? "#22c55e" : "#bbbbbb", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
          >
            {copyFeedback === "join-code" ? "Copied!" : "Share Code"}
          </button>
          <a href={`/event/${event.share_token}`} target="_blank" rel="noopener noreferrer"
            style={{ background: "transparent", border: "1px solid #3a4550", color: "#bbbbbb", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}>
            Public View ↗
          </a>
          {isOrganizer && isLive && (
            <button
              onClick={endEvent}
              style={{ background: "transparent", border: "1px solid #cc3300", color: "#cc3300", padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
            >
              End Event
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e6e6e6", flexShrink: 0, height: TABS_H }}>
        {(["map", "riders", "gep"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "0 24px", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
              border: "none", borderBottom: tab === t ? "2px solid #1c69d4" : "2px solid transparent",
              color: tab === t ? "#1c69d4" : "#6b6b6b", background: "transparent", cursor: "pointer",
            }}
          >
            {t === "riders" ? `Riders (${riders.length})` : t.toUpperCase()}
          </button>
        ))}
        {isOrganizer && (
          <button onClick={openSettings}
            style={{
              padding: "0 24px", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
              border: "none", borderBottom: tab === "settings" ? "2px solid #1c69d4" : "2px solid transparent",
              color: tab === "settings" ? "#1c69d4" : "#6b6b6b", background: "transparent", cursor: "pointer",
            }}
          >
            SETTINGS
          </button>
        )}
      </div>

      {/* ── MAP TAB ── */}
      {tab === "map" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e6e6e6", overflowY: "auto", flexShrink: 0 }}>
            {event.route_name && (
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #e6e6e6", background: "#f0fdf4" }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#15803d", textTransform: "uppercase", margin: 0 }}>Planned Route</p>
                <p style={{ fontSize: 12, color: "#262626", margin: "2px 0 0", fontWeight: 600 }}>{event.route_name}</p>
              </div>
            )}
            {riders.length === 0 && (
              <p style={{ fontSize: 12, color: "#9a9a9a", padding: "16px 14px", margin: 0 }}>No riders yet.</p>
            )}
            {riders.map((rider, i) => {
              const color = RIDER_COLORS[i % RIDER_COLORS.length];
              const minsAgo = rider.latest ? Math.round((Date.now() - new Date(rider.latest.recorded_at).getTime()) / 60000) : null;
              return (
                <div key={rider.id}
                  onClick={() => {
                    if (rider.latest) {
                      setFollowId(followId === rider.id ? null : rider.id);
                      mapRef.current?.flyTo({ center: [rider.latest.lng, rider.latest.lat], zoom: 13, duration: 800 });
                    }
                  }}
                  style={{
                    padding: "10px 14px", borderBottom: "1px solid #e6e6e6",
                    cursor: rider.latest ? "pointer" : "default",
                    background: followId === rider.id ? "#f0f7ff" : "#fff",
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                      {rider.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#262626", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rider.rider_number ? `#${rider.rider_number} ` : ""}{rider.display_name}{rider.role === "organizer" ? " ★" : ""}
                      </p>
                      {rider.rider_class && (
                        <p style={{ fontSize: 10, color: "#9a9a9a", margin: "1px 0 0", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                          {rider.rider_class}
                        </p>
                      )}
                      {rider.latest ? (
                        <p style={{ fontSize: 11, color: minsAgo !== null && minsAgo > 10 ? "#f59e0b" : "#6b6b6b", margin: "1px 0 0" }}>
                          {rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h · {timeAgo(rider.latest.recorded_at)}
                        </p>
                      ) : (
                        <p style={{ fontSize: 11, color: "#9a9a9a", margin: "1px 0 0" }}>No data yet</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={mapContainer} style={{ flex: 1 }} />
        </div>
      )}

      {/* ── RIDERS TAB ── */}
      {tab === "riders" && (
        <div style={{ flex: 1, overflowY: "auto", background: "#f7f7f7" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
            <SectionLabel>Participants</SectionLabel>
            <div style={{ background: "#fff", border: "1px solid #e6e6e6" }}>
              {riders.length === 0 ? (
                <p style={{ padding: "24px", color: "#9a9a9a", fontSize: 13, margin: 0 }}>No riders have joined yet. Share the join code: <strong>{event.join_code}</strong></p>
              ) : riders.map((rider, i) => {
                const color = RIDER_COLORS[i % RIDER_COLORS.length];
                const minsAgo = rider.latest ? Math.round((Date.now() - new Date(rider.latest.recorded_at).getTime()) / 60000) : null;
                return (
                  <div key={rider.id} style={{ padding: "14px 20px", borderBottom: "1px solid #e6e6e6", display: "flex", alignItems: "center", gap: 14, borderLeft: `3px solid ${color}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                      {rider.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#1a2129", margin: 0 }}>
                          {rider.rider_number ? `#${rider.rider_number} ` : ""}{rider.display_name}{rider.role === "organizer" ? " ★" : ""}
                        </p>
                        {rider.rider_class && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#6b6b6b", letterSpacing: 0.5, textTransform: "uppercase", border: "1px solid #e6e6e6", padding: "1px 6px" }}>
                            {rider.rider_class}
                          </span>
                        )}
                      </div>
                      {rider.latest ? (
                        <p style={{ fontSize: 12, color: minsAgo !== null && minsAgo > 10 ? "#f59e0b" : "#6b6b6b", margin: "2px 0 0" }}>
                          {rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h · {timeAgo(rider.latest.recorded_at)}
                          {rider.latest.altitude_m ? ` · ${Math.round(rider.latest.altitude_m)}m` : ""}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12, color: "#9a9a9a", margin: "2px 0 0" }}>No position yet</p>
                      )}
                    </div>
                    {rider.latest && (
                      <Btn border="#e6e6e6" color="#6b6b6b" onClick={() => setTab("map")}>
                        Find on Map
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === "settings" && isOrganizer && (
        <div style={{ flex: 1, overflowY: "auto", background: "#f7f7f7" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Classes */}
            <div>
              <SectionLabel>Rider Classes</SectionLabel>
              <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 24 }}>
                <p style={{ fontSize: 13, color: "#6b6b6b", margin: "0 0 20px", lineHeight: 1.6 }}>
                  Define the class options riders see when joining this event. If left empty, the class field is hidden on the join screen.
                </p>

                {/* Chips */}
                {(editedClasses ?? []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {(editedClasses ?? []).map((cls) => (
                      <div
                        key={cls}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "#1c69d4", color: "#fff", padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 700 }}
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
                    style={{ flex: 1, padding: "10px 14px", border: "1px solid #d4d4d4", fontSize: 14, color: "#1a2129", outline: "none" }}
                  />
                  <button
                    onClick={addEditedClass}
                    disabled={!classInput.trim()}
                    style={{
                      background: classInput.trim() ? "#1a2129" : "#d4d4d4", color: "#fff",
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
                    background: classesSaved ? "#22c55e" : "#1c69d4", color: "#fff",
                    border: "none", padding: "11px 24px", fontSize: 11, fontWeight: 700,
                    letterSpacing: 0.5, textTransform: "uppercase",
                    cursor: savingClasses ? "default" : "pointer",
                  }}
                >
                  {savingClasses ? "Saving…" : classesSaved ? "Saved ✓" : "Save Classes"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── GEP TAB ── */}
      {tab === "gep" && (
        <div style={{ flex: 1, overflowY: "auto", background: "#f7f7f7" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Your GEP link */}
            <div>
              <SectionLabel>Your GEP Link</SectionLabel>
              <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 20 }}>
                <p style={{ fontSize: 13, color: "#6b6b6b", margin: "0 0 14px", lineHeight: 1.6 }}>
                  Open this in Google Earth Pro to see all riders live. Go to Add → Network Link, paste the URL in the Link field. This link is unique to you — do not share it.
                </p>
                {myGepUrl ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      readOnly value={myGepUrl}
                      style={{ flex: 1, padding: "9px 12px", border: "1px solid #e6e6e6", fontSize: 12, color: "#1a2129", background: "#f7f7f7", outline: "none" }}
                    />
                    <Btn onClick={() => copy(myGepUrl, "my-gep")} color={copyFeedback === "my-gep" ? "#22c55e" : "#1c69d4"}>
                      {copyFeedback === "my-gep" ? "Copied!" : "Copy"}
                    </Btn>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "#9a9a9a", margin: 0 }}>GEP link not available yet.</p>
                )}
              </div>
            </div>

            {/* GEP Viewers — organizer only */}
            {isOrganizer && (
              <div>
                <SectionLabel>GEP Viewers</SectionLabel>
                <div style={{ background: "#fff", border: "1px solid #e6e6e6" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e6e6e6" }}>
                    <p style={{ fontSize: 12, color: "#6b6b6b", margin: 0, lineHeight: 1.6 }}>
                      Issue a named KML link to anyone watching in Google Earth Pro — marshals, crew, sponsors. Each link is unique and traceable. Revoking it kills their feed immediately.
                    </p>
                  </div>

                  {credentials.map((cred) => {
                    const url = `${gepBase}/api/events/${event.id}/gep/${cred.gep_token}/network-link.kml`;
                    const copyKey = `cred-${cred.id}`;
                    return (
                      <div key={cred.id} style={{ padding: "12px 20px", borderBottom: "1px solid #e6e6e6", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "#1a2129", margin: 0 }}>{cred.display_name}</p>
                          <p style={{ fontSize: 11, color: "#9a9a9a", margin: "2px 0 0", fontFamily: "monospace" }}>…{cred.gep_token.slice(-10)}</p>
                        </div>
                        <Btn border="#1c69d4" color="#1c69d4" onClick={() => copy(url, copyKey)}>
                          {copyFeedback === copyKey ? "Copied!" : "Copy Link"}
                        </Btn>
                        <Btn border="#cc3300" color="#cc3300" onClick={() => revokeViewer(cred.id, cred.display_name)}>
                          Revoke
                        </Btn>
                      </div>
                    );
                  })}

                  {/* Add viewer */}
                  <div style={{ padding: "16px 20px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9a9a9a", textTransform: "uppercase", margin: "0 0 10px" }}>Add Viewer</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="First Last"
                        value={newViewerName}
                        onChange={(e) => setNewViewerName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addViewer(); }}
                        style={{ flex: 1, padding: "9px 12px", border: "1px solid #d4d4d4", fontSize: 14, color: "#1a2129", outline: "none" }}
                      />
                      <Btn onClick={addViewer} disabled={addingViewer || !newViewerName.trim()}>
                        {addingViewer ? "Adding..." : "Add"}
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Planned route — organizer only */}
            {isOrganizer && (
              <div>
                <SectionLabel>Planned Route</SectionLabel>
                <div style={{ background: "#fff", border: "1px solid #e6e6e6", padding: 20 }}>
                  {event.route_name ? (
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#1a2129", margin: "0 0 6px" }}>📍 {event.route_name}</p>
                      <p style={{ fontSize: 12, color: "#6b6b6b", margin: "0 0 14px" }}>
                        Shown as a dashed green line on the live map and in all GEP feeds.
                      </p>
                      <Btn border="#e6e6e6" color="#6b6b6b" onClick={removeGpx}>Remove Route</Btn>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 13, color: "#6b6b6b", margin: "0 0 14px", lineHeight: 1.6 }}>
                        Upload a .gpx file to show the planned route on the group map and in all GEP feeds.
                      </p>
                      <input
                        type="file" accept=".gpx" ref={gpxInputRef} style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGpx(f); }}
                      />
                      <Btn onClick={() => gpxInputRef.current?.click()} disabled={gpxUploading}>
                        {gpxUploading ? "Uploading..." : "Upload GPX File"}
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Access log — organizer only */}
            {isOrganizer && (
              <div>
                <SectionLabel>GEP Access Log</SectionLabel>
                <div style={{ background: "#fff", border: "1px solid #e6e6e6" }}>
                  {accessLog.length === 0 ? (
                    <p style={{ padding: "20px", color: "#9a9a9a", fontSize: 13, margin: 0 }}>No GEP accesses yet.</p>
                  ) : accessLog.map((entry, i) => (
                    <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid #e6e6e6", display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1a2129", margin: 0 }}>{entry.display_name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "#9a9a9a", textTransform: "uppercase", border: "1px solid #e6e6e6", padding: "1px 6px" }}>
                            {entry.type === "credential" ? "GEP Viewer" : entry.role === "organizer" ? "Organizer" : "Rider"}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: "#6b6b6b", margin: "3px 0 0" }}>
                          {entry.access_count} access{entry.access_count !== 1 ? "es" : ""} · {entry.unique_ips.length} IP{entry.unique_ips.length !== 1 ? "s" : ""} · Last: {entry.last_ip}
                        </p>
                        {entry.unique_ips.length > 1 && (
                          <p style={{ fontSize: 11, color: "#d97706", fontWeight: 700, margin: "4px 0 0" }}>
                            ⚠ Multiple IPs — link may have been shared
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#9a9a9a", whiteSpace: "nowrap" }}>{entry.access_count}×</span>
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
