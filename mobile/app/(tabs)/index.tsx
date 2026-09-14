import { useCallback, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { Camera, MapView, MarkerView, ShapeSource, LineLayer } from "@rnmapbox/maps";
import { hasMapboxToken } from "../../lib/mapbox";
import MapUnavailable from "../../components/MapUnavailable";
import PositionCard, { type PositionInfo } from "../../components/PositionCard";
import { getBeaconStatus } from "../../lib/backgroundTracking";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";

/**
 * The live map: where am I, and is anyone seeing it.
 *
 * There used to be three maps — this one, one inside a trip, one inside an
 * event — and none of them answered "where am I right now", which is the
 * question a rider actually has. This one reads the phone's own GPS whether or
 * not tracking is running, and says plainly which of those two it is.
 *
 * The rest of the field stays on the web. A rider's phone is their own beacon,
 * not command central, and pulling sixty feeds over cell data is the slow path.
 */

type Pt = { lat: number; lng: number };

export default function MapScreen() {
  // History pushes a tripId here rather than owning a second map.
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const [fix, setFix] = useState<Location.LocationObject | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [track, setTrack] = useState<Pt[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const [followed, setFollowed] = useState(true);
  const cameraRef = useRef<Camera>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  // ── Own position, live, regardless of whether we're sharing it ─────────────
  const watch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setDenied(true); return; }
    setDenied(false);

    const first = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    }).catch(() => null);
    if (first) setFix(first);

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
      (loc) => setFix(loc)
    );
  }, []);

  // ── Whatever session is running, and its track ────────────────────────────
  const loadSession = useCallback(async () => {
    const s = await getBeaconStatus();
    setTracking(s.active);

    // Reviewing a past ride from History takes precedence over the live one.
    if (tripId) {
      const { data: trip } = await supabase
        .from("trips").select("name").eq("id", tripId).maybeSingle();
      setReviewing((trip?.name as string) ?? "a past ride");
      const { data } = await supabase
        .from("track_points")
        .select("lat, lng")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: false })
        .limit(2000);
      setTrack(((data as Pt[]) ?? []).reverse());
      setFollowed(false);
      return;
    }
    setReviewing(null);

    if (!s.session) { setLabel(null); setTrack([]); return; }

    if (s.session.mode === "event") {
      setLabel(s.session.eventName ?? "your event");
      const { data } = await supabase
        .from("event_track_points")
        .select("lat, lng")
        .eq("participant_id", s.session.participantId)
        .order("recorded_at", { ascending: false })
        .limit(500);
      setTrack(((data as Pt[]) ?? []).reverse());
    } else {
      setLabel("a personal ride");
      const { data } = await supabase
        .from("track_points")
        .select("lat, lng")
        .eq("trip_id", s.session.tripId)
        .order("recorded_at", { ascending: false })
        .limit(500);
      setTrack(((data as Pt[]) ?? []).reverse());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      watch();
      loadSession();
      const t = setInterval(loadSession, 15000);
      return () => {
        clearInterval(t);
        subRef.current?.remove();
        subRef.current = null;
      };
    }, [watch, loadSession, tripId])
  );

  if (!hasMapboxToken) return <MapUnavailable />;

  const here: [number, number] | null = fix
    ? [fix.coords.longitude, fix.coords.latitude]
    : null;

  const info: PositionInfo | null = fix
    ? {
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracyM: fix.coords.accuracy,
        speedKmh: fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed * 3.6 : null,
        headingDeg: fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading : null,
        ageMs: Date.now() - fix.timestamp,
        title: "You",
      }
    : null;

  const line =
    track.length > 1
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: track.map((p) => [p.lng, p.lat]),
          },
        }
      : null;

  return (
    <View className="flex-1 bg-surface-dark">
      <MapView
        style={{ flex: 1 }}
        styleURL="mapbox://styles/mapbox/outdoors-v12"
        logoEnabled={false}
        attributionEnabled={false}
        onTouchStart={() => setFollowed(false)}
      >
        <Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={followed && here ? here : undefined}
          defaultSettings={{ centerCoordinate: here ?? [-117.16, 32.72], zoomLevel: 12 }}
        />

        {line && (
          <ShapeSource id="own-track" shape={line}>
            <LineLayer
              id="own-track-line"
              style={{ lineColor: theme.track, lineWidth: 4, lineCap: "round", lineJoin: "round" }}
            />
          </ShapeSource>
        )}

        {here && (
          <MarkerView coordinate={here} anchor={{ x: 0.5, y: 0.5 }}>
            <TouchableOpacity onPress={() => setCardOpen(true)} hitSlop={12}>
              <View
                style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: tracking ? theme.action : theme.muted,
                  borderWidth: 3, borderColor: theme.surface,
                }}
              />
            </TouchableOpacity>
          </MarkerView>
        )}
      </MapView>

      {/* Controls */}
      <View style={{ position: "absolute", top: 12, right: 12, gap: 8 }}>
        <TouchableOpacity
          className="bg-surface-dark-elevated border border-hairline rounded-lg px-4 py-3"
          onPress={() => router.push("/history")}
        >
          <Text className="text-on-dark font-bold text-xs tracking-wider">HISTORY</Text>
        </TouchableOpacity>
        {here && !followed && (
          <TouchableOpacity
            className="bg-surface-dark-elevated border border-hairline rounded-lg px-4 py-3"
            onPress={() => { setFollowed(true); cameraRef.current?.setCamera({ centerCoordinate: here, zoomLevel: 14, animationDuration: 500 }); }}
          >
            <Text className="text-on-dark font-bold text-xs tracking-wider">RECENTER</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom panel: the card if open, otherwise the state banner */}
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
        {reviewing ? (
          <View className="bg-surface-dark-elevated border border-hairline rounded-xl p-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-white font-bold text-sm" numberOfLines={1}>{reviewing}</Text>
              <Text className="text-on-dark-soft text-xs mt-0.5">
                {track.length} point{track.length === 1 ? "" : "s"} · past ride
              </Text>
            </View>
            <TouchableOpacity
              className="bg-surface-dark rounded-lg px-4 py-2"
              onPress={() => router.setParams({ tripId: undefined })}
            >
              <Text className="text-on-dark font-bold text-sm">Live</Text>
            </TouchableOpacity>
          </View>
        ) : cardOpen && info ? (
          <PositionCard info={info} onClose={() => setCardOpen(false)} />
        ) : denied ? (
          <View className="bg-surface-dark-elevated border border-hairline rounded-xl p-4">
            <Text className="text-white font-bold text-sm mb-1">Location permission needed</Text>
            <Text className="text-on-dark-soft text-xs leading-5">
              Waypoint can't show where you are without location access.
            </Text>
          </View>
        ) : !fix ? (
          <View className="bg-surface-dark-elevated border border-hairline rounded-xl p-4 flex-row items-center">
            <ActivityIndicator />
            <Text className="text-on-dark-soft text-sm ml-3">Getting a GPS fix…</Text>
          </View>
        ) : tracking ? (
          <TouchableOpacity
            className="bg-primary/20 border border-primary/40 rounded-xl p-4"
            onPress={() => setCardOpen(true)}
          >
            <Text className="text-primary font-bold text-sm mb-1">Tracking · sharing your position</Text>
            <Text className="text-on-dark-soft text-xs">
              {label ? `Recording to ${label}. ` : ""}Tap your marker for coordinates.
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-surface-dark-elevated border border-hairline rounded-xl p-4">
            <Text className="text-white font-bold text-sm mb-1">Not tracking</Text>
            <Text className="text-on-dark-soft text-xs leading-5 mb-3">
              This is your own GPS. Nothing is being shared.
            </Text>
            <TouchableOpacity
              className="bg-primary rounded-lg py-3 items-center"
              onPress={() => router.push("/(tabs)/track")}
            >
              <Text className="text-on-primary font-bold text-sm">Start tracking</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
