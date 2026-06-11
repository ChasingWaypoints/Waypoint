"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
// @ts-ignore
import mapboxgl from "mapbox-gl";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

interface TripData {
  trip: { id: string; name: string; status: string; started_at: string; ended_at: string; share_token: string };
  points: { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string; source: string }[];
  stats: { point_count: number; distance_km: number; duration_minutes: number | null };
}

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  // Live coords — updated by realtime subscription without re-rendering the whole map
  const coordsRef = useRef<[number, number][]>([]);
  const [data, setData] = useState<TripData | null>(null);
  const [liveStats, setLiveStats] = useState<{ pointCount: number; distanceKm: number } | null>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadTrip(pw?: string) {
    setLoading(true);
    setError("");
    try {
      const url = `/api/share/${token}${pw ? `?password=${encodeURIComponent(pw)}` : ""}`;
      const res = await fetch(url);
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }

      if (res.status === 401 && json.error === "password_required") {
        setNeedsPassword(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError((json.error as string) ?? `Error ${res.status}`);
        setLoading(false);
        return;
      }
      setData(json as unknown as TripData);
      setNeedsPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrip(); }, [token]);

  // Initialize map once data loads
  useEffect(() => {
    if (!data || !mapContainer.current) return;

    const coords: [number, number][] = data.points.map((p) => [p.lng, p.lat]);
    coordsRef.current = coords;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-120, 37],
      zoom: 5,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Route line
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords.length ? coords : [] }, properties: {} },
      });
      map.addLayer({
        id: "route", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1c69d4", "line-width": 3 },
      });

      if (coords.length > 0) {
        const latest = coords[coords.length - 1];
        const el = document.createElement("div");
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:#1c69d4;border:2px solid #fff;box-shadow:0 0 0 4px rgba(28,105,212,0.25)`;
        markerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(latest)
          .addTo(map);

        if (coords.length === 1) {
          map.flyTo({ center: latest, zoom: 13 });
        } else {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 60, maxZoom: 15 }
          );
        }
      }
    });

    return () => map.remove();
  }, [data]);

  // Realtime subscription for live trips
  useEffect(() => {
    if (!data || data.trip.status !== "active") return;

    const channel = supabase
      .channel(`share-trip-${data.trip.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "track_points", filter: `trip_id=eq.${data.trip.id}` },
        (payload) => {
          const p = payload.new as { lat: number; lng: number; recorded_at: string };
          const newCoord: [number, number] = [p.lng, p.lat];
          coordsRef.current = [...coordsRef.current, newCoord];

          const map = mapRef.current;
          if (!map || !map.isStyleLoaded()) return;

          // Update route line
          const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
          src?.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coordsRef.current },
            properties: {},
          });

          // Move marker
          markerRef.current?.setLngLat(newCoord);
          map.easeTo({ center: newCoord, duration: 1200 });

          // Update live stats
          setLiveStats((prev) => {
            const prevCoords = coordsRef.current;
            let delta = 0;
            if (prevCoords.length >= 2) {
              const a = prevCoords[prevCoords.length - 2];
              const b = prevCoords[prevCoords.length - 1];
              delta = haversineCoords(a, b);
            }
            return {
              pointCount: (prev?.pointCount ?? data.stats.point_count) + 1,
              distanceKm: Math.round(((prev?.distanceKm ?? data.stats.distance_km) + delta) * 10) / 10,
            };
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data]);

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: "system-ui" }}>
      <p style={{ color: "#6b6b6b", fontSize: 14 }}>Loading trip...</p>
    </div>
  );

  if (needsPassword) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: "system-ui", padding: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#6b6b6b", textTransform: "uppercase", marginBottom: 8 }}>Protected Trip</p>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#262626", marginBottom: 24 }}>Enter Password</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        style={{ border: "1px solid #e6e6e6", padding: "12px 16px", fontSize: 16, width: "100%", maxWidth: 320, outline: "none", borderRadius: 0 }}
        onKeyDown={(e) => e.key === "Enter" && loadTrip(password)}
      />
      <button
        onClick={() => loadTrip(password)}
        style={{ marginTop: 12, background: "#1c69d4", color: "#fff", border: "none", padding: "14px 32px", fontWeight: 700, fontSize: 13, letterSpacing: 0.5, cursor: "pointer", width: "100%", maxWidth: 320 }}
      >
        VIEW TRIP
      </button>
    </div>
  );

  if (error) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: "system-ui" }}>
      <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
    </div>
  );

  if (!data) return null;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ background: "#1a2129", color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#bbbbbb", textTransform: "uppercase", margin: 0 }}>Waypoint</p>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: "#fff" }}>{data.trip.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`${baseUrl}/api/trips/${data.trip.id}/track.kml?token=${token}`}
            style={{ background: "transparent", color: "#bbbbbb", border: "1px solid #3a4550", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase" }}
          >
            KML ↓
          </a>
          <a
            href={`${baseUrl}/api/trips/${data.trip.id}/track.gpx?token=${token}`}
            style={{ background: "transparent", color: "#bbbbbb", border: "1px solid #3a4550", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textDecoration: "none", textTransform: "uppercase" }}
          >
            GPX ↓
          </a>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e6e6e6", padding: "10px 20px", display: "flex", gap: 24, flexShrink: 0, alignItems: "center" }}>
        <Stat label="Points" value={String(liveStats?.pointCount ?? data.stats.point_count)} />
        <Stat label="Distance" value={`${liveStats?.distanceKm ?? data.stats.distance_km} km`} />
        {data.stats.duration_minutes && <Stat label="Duration" value={`${Math.floor(data.stats.duration_minutes / 60)}h ${data.stats.duration_minutes % 60}m`} />}
        <Stat label="Status" value={data.trip.status.toUpperCase()} color={data.trip.status === "active" ? "#22c55e" : "#6b6b6b"} />
        {data.trip.status === "active" && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#22c55e", textTransform: "uppercase" }}>Live</span>
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapContainer} style={{ flex: 1 }} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#9a9a9a", textTransform: "uppercase", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: color ?? "#262626", margin: "2px 0 0" }}>{value}</p>
    </div>
  );
}

function haversineCoords(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
