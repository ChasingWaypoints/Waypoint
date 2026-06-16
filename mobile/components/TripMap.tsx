import { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet, TouchableOpacity } from "react-native";
import Mapbox, { Camera, MapView, ShapeSource, LineLayer, PointAnnotation, MarkerView } from "@rnmapbox/maps";
import { supabase } from "../lib/supabase";

const MAP_STYLES = [
  { id: "outdoors", label: "Terrain", url: "mapbox://styles/mapbox/outdoors-v12" },
  { id: "satellite", label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
];

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

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
  const avgSpeedKmh =
    durationMin && durationMin > 0
      ? Math.round((dist / (durationMin / 60)) * 10) / 10
      : null;
  return { distanceKm: Math.round(dist * 10) / 10, durationMin, avgSpeedKmh };
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.2, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.dotWrapper}>
      <Animated.View style={[styles.dotRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.dotCore} />
    </View>
  );
}

export default function TripMap({ tripId, tripStatus }: TripMapProps) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [stats, setStats] = useState({ distanceKm: 0, durationMin: null as number | null, avgSpeedKmh: null as number | null, count: 0 });
  const [styleIdx, setStyleIdx] = useState(0);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const isLive = tripStatus === "active";

  useEffect(() => {
    if (tripId === "demo") return;
    loadPoints();

    // Use a unique channel name per mount so stale channels from tab switches
    // don't block new subscriptions (removeChannel is async).
    const channelName = `native-map-${tripId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "track_points",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const p = payload.new as TrackPoint;
        setPoints((prev) => {
          const next = [...prev, p];
          setStats({ ...calcStats(next), count: next.length });
          return next;
        });
        cameraRef.current?.setCamera({
          centerCoordinate: [p.lng, p.lat],
          zoomLevel: 13,
          animationDuration: 800,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  async function loadPoints() {
    const { data } = await supabase
      .from("track_points")
      .select("lat, lng, recorded_at, speed_kmh")
      .eq("trip_id", tripId)
      .order("recorded_at", { ascending: true });

    if (!data?.length) return;
    setPoints(data);
    setStats({ ...calcStats(data), count: data.length });

    if (data.length === 1) {
      cameraRef.current?.setCamera({
        centerCoordinate: [data[0].lng, data[0].lat],
        zoomLevel: 13,
        animationDuration: 500,
      });
    } else {
      const lngs = data.map((p) => p.lng);
      const lats = data.map((p) => p.lat);
      cameraRef.current?.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [60, 60, 60, 60],
        500,
      );
    }
  }

  const fmtDuration = (min: number | null) => {
    if (min === null) return null;
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  const latest = points[points.length - 1];
  const start = points[0];

  const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
    properties: {},
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={MAP_STYLES[styleIdx].url}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [-120, 37], zoomLevel: 5 }}
        />

        {/* Route polyline */}
        {points.length > 1 && (
          <ShapeSource id="route" shape={routeGeoJSON}>
            <LineLayer
              id="route-line"
              style={{ lineColor: "#1c69d4", lineWidth: 3, lineJoin: "round", lineCap: "round" }}
            />
          </ShapeSource>
        )}

        {/* Start marker — green dot */}
        {start && (
          <PointAnnotation id="start" coordinate={[start.lng, start.lat]}>
            <View style={styles.startDot} />
          </PointAnnotation>
        )}

        {/* Current position — pulsing blue dot */}
        {latest && (
          <MarkerView id="current" coordinate={[latest.lng, latest.lat]}>
            <PulsingDot />
          </MarkerView>
        )}
      </MapView>

      {/* Map style toggle */}
      <TouchableOpacity
        style={styles.styleToggle}
        onPress={() => setStyleIdx((i) => (i + 1) % MAP_STYLES.length)}
      >
        <Text style={styles.styleToggleText}>
          {MAP_STYLES[(styleIdx + 1) % MAP_STYLES.length].label}
        </Text>
      </TouchableOpacity>

      {/* Stats overlay */}
      <View style={styles.statsBar}>
        <StatChip label="PTS" value={String(stats.count)} />
        <StatChip label="DIST" value={`${stats.distanceKm}km`} />
        {stats.durationMin !== null && <StatChip label="TIME" value={fmtDuration(stats.durationMin)!} />}
        {stats.avgSpeedKmh !== null && <StatChip label="AVG" value={`${stats.avgSpeedKmh}km/h`} />}
        {isLive && (
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={styles.liveDot} />
            <Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>LIVE</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontSize: 8, fontWeight: "700", color: "#888", letterSpacing: 1 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsBar: {
    position: "absolute", bottom: 16, left: 12, right: 12,
    backgroundColor: "rgba(26,33,41,0.9)",
    padding: 12, flexDirection: "row", gap: 16, alignItems: "center",
  },
  dotWrapper: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  dotCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#1c69d4", borderWidth: 2, borderColor: "#fff", position: "absolute" },
  dotRing: { width: 14, height: 14, borderRadius: 7, backgroundColor: "rgba(28,105,212,0.5)", position: "absolute" },
  startDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#fff" },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" },
  styleToggle: {
    position: "absolute", top: 12, right: 12, zIndex: 10,
    backgroundColor: "rgba(26,33,41,0.85)",
    paddingHorizontal: 12, paddingVertical: 7,
  },
  styleToggleText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
});
