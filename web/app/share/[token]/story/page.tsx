"use client";
import { text } from "../../../../lib/theme";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
// @ts-ignore
import mapboxgl from "mapbox-gl";
import { BLANK_STYLE, installBasemaps } from "../../../../components/basemaps";
import Link from "next/link";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface TripData {
  trip: { id: string; name: string; status: string; started_at: string | null; ended_at: string | null };
  points: { lat: number; lng: number; altitude_m: number | null; speed_kmh: number | null; recorded_at: string }[];
  stats: { point_count: number; distance_km: number; duration_minutes: number | null };
  branding?: { plus: boolean; name: string | null };
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
      style: BLANK_STYLE,
      center: [-120, 37],
      zoom: 4,
      interactive: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      installBasemaps(map);
      // Full route (faded)
      map.addSource("route-ghost", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
      });
      map.addLayer({
        id: "route-ghost", type: "line", source: "route-ghost",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FFFE15", "line-width": 2, "line-opacity": 0.15 },
      });

      // Animated route
      map.addSource("route-anim", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: "route-anim", type: "line", source: "route-anim",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FFFE15", "line-width": 3 },
      });

      // Start + end markers
      if (coords.length) {
        new mapboxgl.Marker({ color: "#CCFF00" }).setLngLat(coords[0]).addTo(map);
        if (coords.length > 1) {
          new mapboxgl.Marker({ color: "#FFFE15" }).setLngLat(coords[coords.length - 1]).addTo(map);
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

  // Build a branded 1080×1920 social share card of this ride (route + stats),
  // drawn on a canvas so it works on any phone without tainting from map tiles.
  function downloadShareCard() {
    if (!data) return;
    const pts = data.points;
    const W = 1080, H = 1920, PAD = 90;
    const LIME = "#CCFF00", YEL = "#FFFE15", INK = "#FFFFFF", MUTE = "#8598A5";
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background + top glow
    ctx.fillStyle = "#0A0A0A"; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, -40, 0, W * 0.8, -40, 1000);
    glow.addColorStop(0, "rgba(12,30,41,0.95)"); glow.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // Brand: WP disc + WAY(white)POINT(lime) wordmark
    const dR = 34, dX = PAD + dR, dY = 150 + dR;
    ctx.beginPath(); ctx.arc(dX, dY, dR, 0, Math.PI * 2);
    ctx.fillStyle = LIME; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = "#0C1E29"; ctx.stroke();
    ctx.fillStyle = "#0C1E29"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 32px Arial, sans-serif"; ctx.fillText("WP", dX, dY + 1);
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "800 42px Arial, sans-serif";
    const wmX = dX + dR + 22;
    ctx.fillStyle = INK; ctx.fillText("WAY", wmX, dY);
    ctx.fillStyle = LIME; ctx.fillText("POINT", wmX + ctx.measureText("WAY").width, dY);

    // Eyebrow + trip title (up to 2 lines)
    ctx.textBaseline = "alphabetic";
    let y = 348;
    ctx.fillStyle = LIME; ctx.font = "800 28px Arial, sans-serif";
    ctx.fillText("TRIP STORY", PAD, y);
    y += 78;
    ctx.fillStyle = INK; ctx.font = "800 76px Arial, sans-serif";
    const words = (data.trip.name || "My Ride").toUpperCase().split(" ");
    const lines: string[] = []; let ln = "";
    for (const w of words) {
      const t = ln ? ln + " " + w : w;
      if (ctx.measureText(t).width > W - 2 * PAD && ln) { lines.push(ln); ln = w; } else ln = t;
    }
    if (ln) lines.push(ln);
    for (const l of lines.slice(0, 2)) { ctx.fillText(l, PAD, y); y += 86; }

    // Route drawn from the real GPS points, scaled to fit (north up)
    const rBox = { x: PAD, y: y + 10, w: W - 2 * PAD, h: 760 };
    if (pts.length >= 2) {
      const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
      const dLng = ((maxLng - minLng) * cos) || 1e-6;
      const dLat = (maxLat - minLat) || 1e-6;
      const scale = Math.min(rBox.w / dLng, rBox.h / dLat) * 0.9;
      const ox = rBox.x + (rBox.w - dLng * scale) / 2;
      const oy = rBox.y + (rBox.h - dLat * scale) / 2;
      const proj = pts.map(p => ({ x: ox + (p.lng - minLng) * cos * scale, y: oy + (maxLat - p.lat) * scale }));
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      proj.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.strokeStyle = LIME; ctx.lineWidth = 10; ctx.stroke();
      const dot = (pt: { x: number; y: number }, c: string) => {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
        ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#0A0A0A"; ctx.stroke();
      };
      dot(proj[0], LIME); dot(proj[proj.length - 1], YEL);
    }

    // Stats row
    const stats: [string, string][] = [["DISTANCE", `${data.stats.distance_km} km`]];
    if (data.stats.duration_minutes) stats.push(["DURATION", fmtDuration(data.stats.duration_minutes)!]);
    if (maxSpeed > 0) stats.push(["MAX SPEED", `${Math.round(maxSpeed)} km/h`]);
    if (maxElev !== null) stats.push(["MAX ELEV", `${maxElev} m`]);
    const cols = Math.min(stats.length, 4);
    const colW = (W - 2 * PAD) / cols;
    const sY = rBox.y + rBox.h + 96;
    stats.slice(0, cols).forEach(([label, val], i) => {
      const cx = PAD + colW * i;
      ctx.textAlign = "left";
      ctx.fillStyle = MUTE; ctx.font = "800 24px Arial, sans-serif"; ctx.fillText(label, cx, sY);
      ctx.fillStyle = INK; ctx.font = "800 50px Arial, sans-serif"; ctx.fillText(val, cx, sY + 60);
    });

    // Footer
    const fY = H - 150;
    ctx.textAlign = "left"; ctx.fillStyle = MUTE; ctx.font = "700 30px Arial, sans-serif";
    ctx.fillText("Tracked live with", PAD, fY);
    ctx.fillStyle = INK; ctx.font = "800 36px Arial, sans-serif"; ctx.fillText("WAY", PAD, fY + 50);
    ctx.fillStyle = LIME; ctx.fillText("POINT", PAD + ctx.measureText("WAY").width, fY + 50);
    ctx.textAlign = "right"; ctx.fillStyle = MUTE; ctx.font = "700 28px Arial, sans-serif";
    ctx.fillText("waypointtracking.com", W - PAD, fY + 50);

    const slug = (data.trip.name || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "trip";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}-waypoint.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  if (loading) return <StorySkeleton />;

  if (error) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      <p style={{ color: "#FF3B30", fontSize: text.base }}>{error}</p>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#0A0A0A", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{ background: "#0C1E29", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {data.branding?.plus ? (
          <span style={{ color: "#fff", fontWeight: 700, fontSize: text.md, letterSpacing: 1, textTransform: "uppercase" }}>
            {data.branding.name || "Trip Story"}
          </span>
        ) : (
          <Link href="/" style={{ color: "#fff", fontWeight: 700, fontSize: text.md, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none" }}>
            Waypoint
          </Link>
        )}
        <Link
          href={`/share/${token}`}
          style={{ background: "#CCFF00", color: "#0C1E29", padding: "7px 14px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none" }}
        >
          View Live Map →
        </Link>
      </nav>

      {/* Hero — trip name + date */}
      <div style={{ background: "#0C1E29", padding: "40px 24px 32px", textAlign: "center" }}>
        <p style={{ fontSize: text.xs, fontWeight: 700, letterSpacing: 2, color: "#4a8ab5", textTransform: "uppercase", margin: "0 0 10px" }}>
          Trip Story
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#fff", margin: "0 0 10px", lineHeight: 1.15 }}>
          {data.trip.name}
        </h1>
        {data.trip.started_at && (
          <p style={{ fontSize: text.base, color: "#7E93A0", fontWeight: 300, margin: 0 }}>
            {fmtDate(data.trip.started_at)}
            {data.trip.ended_at && data.trip.ended_at !== data.trip.started_at && ` — ${fmtDate(data.trip.ended_at)}`}
          </p>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ background: "#0C1E29", borderBottom: "1px solid #1E3B4C", padding: "16px 24px", display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
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
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "#1E3B4C" }}>
            <div style={{ height: "100%", width: `${animProgress}%`, background: "#CCFF00", transition: "width 0.1s linear" }} />
          </div>
        )}

        {/* Replay button */}
        {!animating && animProgress === 100 && (
          <button
            onClick={replayAnimation}
            style={{
              // Top-right so it never overlaps the basemap selector (top-left).
              position: "absolute", top: 12, right: 12,
              background: "#CCFF00", color: "#0C1E29", border: "none",
              padding: "8px 14px", fontSize: text.xs, fontWeight: 700, letterSpacing: 0.8,
              textTransform: "uppercase", cursor: "pointer", zIndex: 2,
            }}
          >
            ↺ Replay Route
          </button>
        )}
      </div>

      {/* CTA */}
      <div style={{ background: "#0C1E29", padding: "48px 24px", textAlign: "center" }}>
        <p style={{ fontSize: text.base, color: "#7E93A0", fontWeight: 300, margin: "0 0 20px" }}>
          Post your ride — or follow it live.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={downloadShareCard}
            style={{ background: "#CCFF00", color: "#0C1E29", padding: "14px 28px", fontSize: text.sm, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", border: "none", cursor: "pointer" }}
          >
            ↓ Download Share Card
          </button>
          <Link
            href={`/share/${token}`}
            style={{ background: "transparent", color: "#fff", border: "1px solid #3a4550", padding: "14px 28px", fontSize: text.sm, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textDecoration: "none" }}
          >
            View Live Map
          </Link>
          {!data.branding?.plus && (
            <Link
              href="/auth/signup"
              style={{ background: "transparent", color: "#fff", border: "1px solid #3a4550", padding: "14px 28px", fontSize: text.sm, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", textDecoration: "none" }}
            >
              Track Your Own Trip
            </Link>
          )}
        </div>

        {/* Download the GPS track — works on phone; saves to Files / Downloads */}
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: text.xs, color: "#54697A", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 10px" }}>
            Download this ride
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href={`/api/trips/${data.trip.id}/track.gpx?token=${token}`}
              download
              style={{ background: "transparent", color: "#C8D4DC", border: "1px solid #24445A", padding: "10px 20px", fontSize: text.sm, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", borderRadius: 4 }}
            >
              GPX ↓
            </a>
            <a
              href={`/api/share/${token}/track.kml`}
              download
              style={{ background: "transparent", color: "#C8D4DC", border: "1px solid #24445A", padding: "10px 20px", fontSize: text.sm, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", textDecoration: "none", borderRadius: 4 }}
            >
              KML ↓
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: "#0f1923", padding: "20px 24px", textAlign: "center" }}>
        <p style={{ fontSize: text.xs, color: "#1E3B4C", fontWeight: 300, margin: 0 }}>
          © {new Date().getFullYear()} {data.branding?.plus ? (data.branding.name || "") : "Waypoint · "}We never sell your location data. Ever.
        </p>
      </footer>

    </div>
  );
}

function StorySkeleton() {
  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh" }} aria-busy="true" aria-label="Loading trip story">
      {/* Nav */}
      <nav style={{ background: "#0C1E29", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="wp-skel" style={{ width: 96, height: 14 }} />
        <div className="wp-skel" style={{ width: 120, height: 28 }} />
      </nav>
      {/* Hero */}
      <div style={{ background: "#0C1E29", padding: "40px 24px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div className="wp-skel" style={{ width: 90, height: 9 }} />
        <div className="wp-skel" style={{ width: 260, height: 30 }} />
        <div className="wp-skel" style={{ width: 180, height: 12 }} />
      </div>
      {/* Stats bar */}
      <div style={{ background: "#0C1E29", borderBottom: "1px solid #1E3B4C", padding: "16px 24px", display: "flex", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <div className="wp-skel" style={{ width: 70, height: 16 }} />
            <div className="wp-skel" style={{ width: 50, height: 8 }} />
          </div>
        ))}
      </div>
      {/* Map */}
      <div className="wp-skel" style={{ width: "100%", height: "60vh", minHeight: 360, borderRadius: 0 }} />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: text.xxs, fontWeight: 700, letterSpacing: 1.5, color: "#7E93A0", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF", marginTop: 2 }}>{value}</div>
    </div>
  );
}
