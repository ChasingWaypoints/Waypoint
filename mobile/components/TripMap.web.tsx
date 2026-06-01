import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// @ts-ignore
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface TrackPoint {
  lat: number;
  lng: number;
  recorded_at: string;
}

interface TripMapProps {
  tripId: string;
}

mapboxgl.accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export default function TripMap({ tripId }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [stats, setStats] = useState({ count: 0, lastUpdate: "" });
  const pointsRef = useRef<TrackPoint[]>([]);

  useEffect(() => {
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
      // Add route source + layer
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1c69d4", "line-width": 3 },
      });

      // Skip DB query for demo mode
      if (tripId === "demo") return;

      // Load existing points
      const { data } = await supabase
        .from("track_points")
        .select("lat, lng, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true });

      if (data?.length) {
        pointsRef.current = data;
        updateMap(data, map);
        setStats({ count: data.length, lastUpdate: data[data.length - 1].recorded_at });
      }
    });

    // Realtime
    const channel = supabase
      .channel(`map-${tripId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "track_points",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const p = payload.new as TrackPoint;
        pointsRef.current = [...pointsRef.current, p];
        updateMap(pointsRef.current, mapRef.current!);
        setStats({ count: pointsRef.current.length, lastUpdate: p.recorded_at });
        mapRef.current?.flyTo({ center: [p.lng, p.lat], duration: 800 });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      map.remove();
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

    const latest = pts[pts.length - 1];
    if (!latest) return;

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: #1c69d4; border: 2px solid #fff;
        box-shadow: 0 0 0 4px rgba(28,105,212,0.3);
      `;
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([latest.lng, latest.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([latest.lng, latest.lat]);
    }

    // Fit bounds on first load
    if (pts.length > 1) {
      const lngs = pts.map((p) => p.lng);
      const lats = pts.map((p) => p.lat);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 800, maxZoom: 15 }
      );
    } else {
      map.flyTo({ center: [latest.lng, latest.lat], zoom: 13 });
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", minHeight: 400 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Stats bar */}
      <div style={{
        position: "absolute", bottom: 16, left: 16,
        background: "#1a2129", color: "#fff",
        padding: "8px 12px", fontSize: 11, fontWeight: 700,
        letterSpacing: "0.8px", display: "flex", gap: 12, alignItems: "center",
      }}>
        <span>{stats.count} POINTS</span>
        {stats.lastUpdate && (
          <span style={{ color: "#bbbbbb", fontWeight: 300 }}>
            {new Date(stats.lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
