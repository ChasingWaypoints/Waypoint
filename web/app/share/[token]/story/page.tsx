"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
// @ts-ignore
import mapboxgl from "mapbox-gl";
import Link from "next/link";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface TripData {
  trip: { id: string; name: string; status: string; started_at: string | null; ended_at: string | null };
  points: { lat: number; lng: number; altitude_m: number | null; speed_kmh: number | null; recorded_at: string }[];
  stats: { point_count: number; distance_km: number; duration_minutes: number | null };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function StoryPage() {
  const { token } = useParams<{ token: string }>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(0); // 0–100

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error); }
        else { setData(json as TripData); }
      })
      .catch(() => setError("Failed to load trip"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!data || !mapContainer.current) return;
    const coords: [number, number][] = data.points.map((p) => [p.lng, p.lat]);

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-120, 37],
      zoom: 4,
      interactive: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Full route (faded)
      map.addSource("route-ghost", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
      });
      map.addLayer({
        id: "route-ghost", type: "line", source: "route-ghost",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1c69d4", "line-width": 2, "line-opacity": 0.15 },
      });

      // Animated route
      map.addSource("route-anim", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: "route-anim", type: "line", source: "route-anim",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1c69d4", "line-width": 3 },
      });

      // Start + end markers
      if (coords.length) {
        new mapboxgl.Marker({ color: "#22c55e" }).setLngLat(coords[0]).addTo(map);
        if (coords.length > 1) {
          new mapboxgl.Marker({ color: "#1c69d4" }).setLngLat(coords[coords.length - 1]).addTo(map);
        }
      }

      // Fit bounds
      if (coords.length > 1) {
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, duration: 1000, maxZoom: 14 }
        );
      } else if (coords.length === 1) {
        map.flyTo({ center: coords[0], zoom: 12, duration: 1000 });
      }

      // Auto-play animation after 1.5s
      setTimeout(() => playAnimation(coords, map), 1500);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [data]);

  function playAnimation(coords: [number, number][], map: mapboxgl.Map) {
    if (!coords.length) return;
    setAnimating(true);
    let frame = 0;
    const total = coords.length;
    const DURATION_MS = Math.min(Math.max(total * 30, 3000), 12000); // 3–12s depending on point count
    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / DURATION_MS, 1);
      const idx = Math.ceil(t * total);
      setAnimProgress(Math.round(t * 100));

      const src = map.getSource("route-anim") as mapboxgl.GeoJSONSource;
      if (src) {
        src.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords.slice(0, Math.max(idx, 1)) },
          properties: {},
        });
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setAnimating(false);
        setAnimProgress(100);
      }
    }

    requestAnimationFrame(step);
  }

  function replayAnimation() {
    if (!data || !mapRef.current || animating) return;
    const coords: [number, number][] = data.points.map((p) => [p.lng, p.lat]);
    // Reset
    const src = mapRef.current.getSource("route-anim") as mapboxgl.GeoJSONSource;
    src?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} });
    setAnimProgress(0);
    setTimeout(() => playAnimation(coords, mapRef.current!), 200);
  }

  // Extended stats
  const maxSpeed = data ? Math.max(...data.points.map((p) => p.speed_kmh ?? 0)) : 0;
  const elevations = data ? data.points.map((p) => p.altitude_m ?? 0).filter((e) => e > 0) : [];
  const maxElev = elevations.length ? Math.round(Math.max(...elevations)) : null;
  const minElev = elevations.length ? Math.round(Math.min(...elevations)) : null;
  const elevGain = data && elevations.length > 1
    ? Math.round(data.points.reduce((acc, p, i) => {
        if (i === 0 || !p.altitude_m) return acc;
        const prev = data.points[i - 1].altitude_m ?? 0;
        return acc + Math.max(0, (p.altitude_m ?? 0) - prev);
      }, 0))
    : null;

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const fmtDuration = (min: number | null) => {
    if (!min) return null;
    return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#9a9a9a", fontSize: 13 }}>Loading trip story...</p>
    </div>
  );

  if (error) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f7f7", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ background: "#1a2129", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
          Waypoint
        </Link>
        <Link
          href={`/share/${token}`}
          style={{ background: "#1c69d4", color: "#fff", padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
        >
          View Live Map →
        </Link>
      </nav>

      {/* Hero — trip name + date */}
      <div style={{ background: "#1a2129", padding: "40px 24px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#4a8ab5", textTransform: "uppercase", margin: "0 0 10px" }}>
          Trip Story
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#fff", margin: "0 0 10px", lineHeight: 1.15 }}>
          {data.trip.name}
        </h1>
        {data.trip.started_at && (
          <p style={{ fontSize: 13, color: "#8a9ab0", fontWeight: 300, margin: 0 }}>
            {fmtDate(data.trip.started_at)}
            {data.trip.ended_at && data.trip.ended_at !== data.trip.started_at && ` — ${fmtDate(data.trip.ended_at)}`}
          </p>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e6e6e6", padding: "16px 24px", display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
        <StatPill label="Distance" value={`${data.stats.distance_km} km`} />
        {data.stats.duration_minutes && <StatPill label="Duration" value={fmtDuration(data.stats.duration_minutes)!} />}
        {maxSpeed > 0 && <StatPill label="Max Speed" value={`${Math.round(maxSpeed)} km/h`} />}
        {elevGain !== null && <StatPill label="Elevation Gain" value={`${elevGain} m`} />}
        {maxElev !== null && <StatPill label="Max Elevation" value={`${maxElev} m`} />}
        <StatPill label="Track Points" value={String(data.stats.point_count)} />
      </div>

      {/* Map */}
      <div style={{ position: "relative" }}>
        <div ref={mapContainer} style={{ width: "100%", height: "60vh", minHeight: 360 }} />

        {/* Progress bar */}
        {(animating || animProgress > 0) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#e6e6e6" }}>
            <div style={{ height: "100%", width: `${animProgress}%`, background: "#1c69d4", transition: "width 0.1s linear" }} />
          </div>
        )}

        {/* Replay button */}
        {!animating && animProgress === 100 && (
          <button
            onClick={replayAnimation}
            style={{
              position: "absolute", top: 12, left: 12,
              background: "#1a2129", color: "#fff", border: "none",
              padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
              textTransform: "uppercase", cursor: "pointer",
            }}
          >
            ↺ Replay Route
          </button>
        )}
      </div>

      {/* CTA */}
      <div style={{ background: "#1a2129", padding: "48px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#8a9ab0", fontWeight: 300, margin: "0 0 20px" }}>
          Follow this trip live — or track your own.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href={`/share/${token}`}
            style={{ background: "#1c69d4", color: "#fff", padding: "14px 28px", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textDecoration: "none" }}
          >
            View Live Map
          </Link>
          <Link
            href="/auth/signup"
            style={{ background: "transparent", color: "#fff", border: "1px solid #3a4550", padding: "14px 28px", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textDecoration: "none" }}
          >
            Track Your Own Trip
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: "#0f1923", padding: "20px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "#3a4550", fontWeight: 300, margin: 0 }}>
          © {new Date().getFullYear()} Waypoint · We never sell your location data. Ever.
        </p>
      </footer>

    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#1a2129", marginTop: 2 }}>{value}</div>
    </div>
  );
}
