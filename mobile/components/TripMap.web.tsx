import { useEffect, useRef, useState } from "react";
import Map, { Source, Layer, NavigationControl } from "react-map-gl";
import type { MapRef, LineLayer, CircleLayer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../lib/supabase";

interface TrackPoint {
  lat: number;
  lng: number;
  recorded_at: string;
}

interface TripMapProps {
  tripId: string;
}

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const routeLayer: LineLayer = {
  id: "route",
  type: "line",
  layout: { "line-join": "round", "line-cap": "round" },
  paint: { "line-color": "#1c69d4", "line-width": 3, "line-opacity": 0.9 },
};

const currentPositionLayer: CircleLayer = {
  id: "current-position",
  type: "circle",
  paint: {
    "circle-radius": 8,
    "circle-color": "#1c69d4",
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

export default function TripMap({ tripId }: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [stats, setStats] = useState({ count: 0, lastUpdate: "" });

  // Initial load
  useEffect(() => {
    async function loadPoints() {
      const { data } = await supabase
        .from("track_points")
        .select("lat, lng, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true });
      if (data) {
        setPoints(data);
        setStats({ count: data.length, lastUpdate: data[data.length - 1]?.recorded_at ?? "" });
        fitBounds(data);
      }
    }
    loadPoints();
  }, [tripId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "track_points",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const p = payload.new as TrackPoint;
        setPoints((prev) => [...prev, p]);
        setStats({ count: points.length + 1, lastUpdate: p.recorded_at });
        mapRef.current?.flyTo({ center: [p.lng, p.lat], duration: 1000 });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId, points.length]);

  function fitBounds(pts: TrackPoint[]) {
    if (!pts.length || !mapRef.current) return;
    if (pts.length === 1) {
      mapRef.current.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 13 });
      return;
    }
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 }
    );
  }

  const geojsonLine = {
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  };

  const latest = points[points.length - 1];
  const currentPoint = latest ? {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [latest.lng, latest.lat] },
    properties: {},
  } : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: -120, latitude: 37, zoom: 5 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
      >
        <NavigationControl position="top-right" />

        {points.length > 1 && (
          <Source id="route" type="geojson" data={geojsonLine}>
            <Layer {...routeLayer} />
          </Source>
        )}

        {currentPoint && (
          <Source id="current" type="geojson" data={currentPoint}>
            <Layer {...currentPositionLayer} />
          </Source>
        )}
      </Map>

      {/* Stats overlay */}
      <div style={{
        position: "absolute", bottom: 16, left: 16,
        background: "#1a2129", color: "#fff",
        padding: "10px 14px", fontSize: 12, fontWeight: 700,
        letterSpacing: "0.5px",
      }}>
        {stats.count} POINTS
        {stats.lastUpdate && (
          <span style={{ color: "#bbbbbb", fontWeight: 300, marginLeft: 10 }}>
            Last: {new Date(stats.lastUpdate).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
