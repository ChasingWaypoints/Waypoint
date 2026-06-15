import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// @ts-ignore
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface TrackPoint {
  lat: number;
  lng: number;
  recorded_at: string;
  speed_kmh: number | null;
}

interface TripMapProps {
  tripId: string;
  tripStatus?: string;
}

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// Haversine distance in km between two points
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcStats(pts: TrackPoint[]) {
  if (!pts.length) return { distanceKm: 0, durationMin: null as number | null, avgSpeedKmh: null as number | null };
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  }
  const first = new Date(pts[0].recorded_at).getTime();
  const last = new Date(pts[pts.length - 1].recorded_at).getTime();
  const durationMin = pts.length > 1 ? Math.round((last - first) / 60000) : null;
  const avgSpeedKmh = durationMin && durationMin > 0
    ? Math.round((dist / (durationMin / 60)) * 10) / 10
    : null;
  return { distanceKm: Math.round(dist * 10) / 10, durationMin, avgSpeedKmh };
}

// Inject pulsing keyframe animation once
let pulseInjected = false;
function injectPulse() {
  if (pulseInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes wp-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(28,105,212,0.6); }
      70%  { box-shadow: 0 0 0 12px rgba(28,105,212,0);   }
      100% { box-shadow: 0 0 0 0   rgba(28,105,212,0);    }
    }
    .wp-pulse-dot {
      width: 14px; height: 14px; border-radius: 50%;
      background: #1c69d4; border: 2px solid #fff;
      animation: wp-pulse 2s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
  pulseInjected = true;
}

export default function TripMap({ tripId, tripStatus }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const pointsRef = useRef<TrackPoint[]>([]);
  const fitDoneRef = useRef(false);
  const [stats, setStats] = useState({ distanceKm: 0, durationMin: null as number | null, avgSpeedKmh: null as number | null, count: 0, lastUpdate: "" });
  const isLive = tripStatus === "active";

  useEffect(() => {
    injectPulse();
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-120, 37],
      zoom: 5,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", async () => {
      // Route line
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1c69d4", "line-width": 3, "line-opacity": 0.9 },
      });
      // Start dot (green)
      map.addSource("start", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "start-dot", type: "circle", source: "start",
        paint: { "circle-radius": 6, "circle-color": "#22c55e", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });

      if (tripId === "demo") return;

      const { data } = await supabase
        .from("track_points")
        .select("lat, lng, recorded_at, speed_kmh")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true });

      if (data?.length) {
        pointsRef.current = data;
        updateMap(data, map);
        setStats({ ...calcStats(data), count: data.length, lastUpdate: data[data.length - 1].recorded_at });
      }
    });

    // Realtime for active trips
    const channel = supabase
      .channel(`map-${tripId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "track_points",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const p = payload.new as TrackPoint;
        pointsRef.current = [...pointsRef.current, p];
        updateMap(pointsRef.current, mapRef.current!);
        const s = calcStats(pointsRef.current);
        setStats({ ...s, count: pointsRef.current.length, lastUpdate: p.recorded_at });
        mapRef.current?.easeTo({ center: [p.lng, p.lat], duration: 1000 });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      fitDoneRef.current = false;
    };
  }, [tripId]);

  function updateMap(pts: TrackPoint[], map: mapboxgl.Map) {
    if (!map || !map.getSource("route")) return;
    const coords = pts.map((p) => [p.lng, p.lat]);

    (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    });

    // Green start dot
    (map.getSource("start") as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: pts.length ? [{ type: "Feature", geometry: { type: "Point", coordinates: coords[0] }, properties: {} }] : [],
    });

    const latest = pts[pts.length - 1];
    if (!latest) return;

    // Pulsing blue current-position marker
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "wp-pulse-dot";
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([latest.lng, latest.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([latest.lng, latest.lat]);
    }

    // Fit bounds only on initial load
    if (!fitDoneRef.current && pts.length > 1) {
      fitDoneRef.current = true;
      const lngs = pts.map((p) => p.lng);
      const lats = pts.map((p) => p.lat);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 800, maxZoom: 15 }
      );
    } else if (!fitDoneRef.current) {
      fitDoneRef.current = true;
      map.flyTo({ center: [latest.lng, latest.lat], zoom: 13 });
    }
  }

  const fmtDuration = (min: number | null) => {
    if (min === null) return null;
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", minHeight: 400 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Stats bar */}
      <div style={{
        position: "absolute", bottom: 16, left: 16, right: 16,
        background: "rgba(26,33,41,0.92)", backdropFilter: "blur(8px)",
        padding: "10px 16px", display: "flex", gap: 20, alignItems: "center",
        flexWrap: "wrap",
      }}>
        <StatChip label="POINTS" value={String(stats.count)} />
        <StatChip label="DISTANCE" value={`${stats.distanceKm} km`} />
        {stats.durationMin !== null && <StatChip label="DURATION" value={fmtDuration(stats.durationMin)!} />}
        {stats.avgSpeedKmh !== null && <StatChip label="AVG SPEED" value={`${stats.avgSpeedKmh} km/h`} />}
        {isLive && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
              display: "inline-block", animation: "wp-pulse 2s ease-out infinite",
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: 1 }}>LIVE</span>
          </div>
        )}
        {stats.lastUpdate && (
          <span style={{ fontSize: 10, color: "#666", fontWeight: 300, marginLeft: isLive ? 0 : "auto" }}>
            {new Date(stats.lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 1 }}>{value}</div>
    </div>
  );
}
