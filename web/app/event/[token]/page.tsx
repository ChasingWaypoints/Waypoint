"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
// @ts-ignore
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const RIDER_COLORS = [
  "#1c69d4", "#00aa44", "#cc3300", "#cc00aa",
  "#0099cc", "#ff6600", "#006699", "#cc6600",
];

interface Rider {
  id: string;
  display_name: string;
  role: string;
  latest: { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string } | null;
  track: { lat: number; lng: number; altitude_m: number }[];
}

interface EventData {
  id: string; name: string; status: string;
  route_gpx: string | null; route_name: string | null;
  starts_at: string | null;
}

interface ApiResponse { event: EventData; riders: Rider[] }

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function gpxToCoords(gpx: string): [number, number][] {
  const matches = [...gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)];
  if (matches.length) return matches.map((m) => [parseFloat(m[2]), parseFloat(m[1])]);
  const matches2 = [...gpx.matchAll(/<trkpt\s+lon="([^"]+)"\s+lat="([^"]+)"/g)];
  return matches2.map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
}

export default function EventPage() {
  const { token } = useParams<{ token: string }>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [followId, setFollowId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/public/${token}`);
      if (!res.ok) { setError("Event not found"); setLoading(false); return; }
      const json: ApiResponse = await res.json();
      setData(json);
      setLoading(false);
    } catch { setError("Failed to load event"); setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 20s for live events
  useEffect(() => {
    if (!data || data.event.status !== "active") return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [data?.event?.status, load]);

  // Init map
  useEffect(() => {
    if (!data || !mapContainer.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-105, 40], zoom: 4,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => setMapReady(true));
    return () => { map.remove(); mapRef.current = null; };
  }, [data]);

  // Sync riders to map whenever data or map readiness changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;

    const allCoords: [number, number][] = [];

    // GPX planned route
    if (data.event.route_gpx) {
      const routeCoords = gpxToCoords(data.event.route_gpx);
      if (routeCoords.length) {
        const src = map.getSource("planned-route") as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: routeCoords }, properties: {} });
        } else {
          map.addSource("planned-route", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: routeCoords }, properties: {} },
          });
          map.addLayer({
            id: "planned-route", type: "line", source: "planned-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 3, "line-dasharray": [2, 2] },
          });
        }
      }
    }

    // Riders
    data.riders.forEach((rider, i) => {
      const color = RIDER_COLORS[i % RIDER_COLORS.length];

      // Track line
      if (rider.track.length > 1) {
        const coords: [number, number][] = rider.track.map((p) => [p.lng, p.lat]);
        const srcId = `track-${rider.id}`;
        const src = map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} });
        } else {
          map.addSource(srcId, {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
          });
          map.addLayer({
            id: srcId, type: "line", source: srcId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": color, "line-width": 2.5 },
          });
        }
      }

      // Position marker
      if (rider.latest) {
        const lngLat: [number, number] = [rider.latest.lng, rider.latest.lat];
        allCoords.push(lngLat);

        if (markersRef.current[rider.id]) {
          markersRef.current[rider.id].setLngLat(lngLat);
        } else {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 36px; height: 36px; border-radius: 50%;
            background: ${color}; border: 3px solid #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 800; color: #fff;
            cursor: pointer; font-family: system-ui;
          `;
          el.textContent = rider.display_name.slice(0, 2).toUpperCase();
          el.title = rider.display_name;
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(lngLat)
            .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(
              `<strong>${rider.display_name}</strong><br/>
               ${rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h &nbsp;·&nbsp;
               ${timeAgo(rider.latest.recorded_at)}`
            ))
            .addTo(map);
          markersRef.current[rider.id] = marker;
        }

        if (followId === rider.id) {
          map.easeTo({ center: lngLat, duration: 800 });
        }
      }
    });

    // Fit bounds to all riders on first load
    if (allCoords.length && Object.keys(markersRef.current).length === data.riders.filter(r => r.latest).length) {
      if (allCoords.length === 1) {
        map.flyTo({ center: allCoords[0], zoom: 12 });
      } else if (allCoords.length > 1) {
        const lngs = allCoords.map((c) => c[0]);
        const lats = allCoords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 80, maxZoom: 14, duration: 1000 }
        );
      }
    }
  }, [data, mapReady, followId]);

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#6b6b6b", fontSize: 14 }}>Loading event...</p>
    </div>
  );
  if (error) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
    </div>
  );
  if (!data) return null;

  const { event, riders } = data;
  const isLive = event.status === "active";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ background: "#1a2129", color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#bbbbbb", textTransform: "uppercase", margin: 0 }}>Waypoint · Group Event</p>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0" }}>{event.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isLive && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#22c55e", textTransform: "uppercase" }}>Live</span>
            </div>
          )}
          <span style={{ fontSize: 11, color: "#9a9a9a" }}>{riders.length} rider{riders.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Rider sidebar + map */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 220, background: "#fff", borderRight: "1px solid #e6e6e6", overflowY: "auto", flexShrink: 0 }}>
          {event.route_name && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #e6e6e6", background: "#f0fdf4" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#15803d", textTransform: "uppercase", margin: 0 }}>Planned Route</p>
              <p style={{ fontSize: 12, color: "#262626", margin: "2px 0 0", fontWeight: 600 }}>{event.route_name}</p>
            </div>
          )}
          {riders.map((rider, i) => {
            const color = RIDER_COLORS[i % RIDER_COLORS.length];
            const minsAgo = rider.latest
              ? Math.round((Date.now() - new Date(rider.latest.recorded_at).getTime()) / 60000)
              : null;
            const isStale = minsAgo !== null && minsAgo > 10;

            return (
              <div
                key={rider.id}
                onClick={() => {
                  if (rider.latest) {
                    setFollowId(followId === rider.id ? null : rider.id);
                    mapRef.current?.flyTo({ center: [rider.latest.lng, rider.latest.lat], zoom: 13, duration: 800 });
                  }
                }}
                style={{
                  padding: "10px 14px", borderBottom: "1px solid #e6e6e6", cursor: rider.latest ? "pointer" : "default",
                  background: followId === rider.id ? "#f0f7ff" : "#fff",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0,
                  }}>
                    {rider.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#262626", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {rider.display_name}{rider.role === "organizer" ? " ★" : ""}
                    </p>
                    {rider.latest ? (
                      <p style={{ fontSize: 11, color: isStale ? "#f59e0b" : "#6b6b6b", margin: "1px 0 0", fontWeight: 300 }}>
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

        {/* Map */}
        <div ref={mapContainer} style={{ flex: 1 }} />
      </div>
    </div>
  );
}
