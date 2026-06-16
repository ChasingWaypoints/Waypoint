import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, Share, RefreshControl, Linking,
  TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Camera, MapView, MarkerView, ShapeSource, LineLayer } from "@rnmapbox/maps";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";
// Mapbox token is already initialised in TripMap.tsx — do not call setAccessToken again

// MapView only accepts Mapbox components as children — use Fragment, not View
function MapboxFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const RIDER_COLORS = [
  "#1c69d4", "#00aa44", "#cc3300", "#cc00aa",
  "#0099cc", "#ff6600", "#006699", "#cc6600",
];

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

interface TrackPoint {
  lat: number; lng: number; altitude_m: number;
  speed_kmh: number; recorded_at: string;
}

interface Rider {
  id: string; user_id: string; display_name: string; role: string;
  latest: TrackPoint | null; track: TrackPoint[];
}

interface GepCredential {
  id: string; display_name: string; gep_token: string; created_at: string;
}

interface EventDetail {
  id: string; name: string; status: string; join_code: string;
  share_token: string; route_gpx: string | null; route_name: string | null;
  organizer_id: string;
}

type TabId = "map" | "riders" | "gep";

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cameraRef = useRef<Camera>(null);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [myGepToken, setMyGepToken] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);

  // Named GEP credential state
  const [gepCredentials, setGepCredentials] = useState<GepCredential[]>([]);
  const [newCredName, setNewCredName] = useState("");
  const [addingCred, setAddingCred] = useState(false);

  const [gepAccessLog, setGepAccessLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>("map");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }

  async function load() {
    const session = await getSession();
    if (!session) { setLoading(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setEvent(json.event);
    setRiders(json.riders ?? []);
    setMyGepToken(json.my_gep_token);
    setIsOrganizer(json.is_organizer);
    navigation.setOptions({ title: json.event.name });
    setLoading(false);
    setRefreshing(false);
  }

  async function loadGepCredentials() {
    const session = await getSession();
    if (!session) return;
    const res = await fetch(`${WEB_BASE}/api/events/${id}/gep-credentials`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setGepCredentials(await res.json());
  }

  async function loadGepLog() {
    const session = await getSession();
    if (!session) return;
    const res = await fetch(`${WEB_BASE}/api/events/${id}/gep-access`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setGepAccessLog(json.summary ?? []);
    }
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (tab === "gep" && isOrganizer) {
      loadGepCredentials();
      loadGepLog();
    }
  }, [tab, isOrganizer]);

  // Fit camera to all riders with positions
  useEffect(() => {
    const withPos = riders.filter((r) => r.latest);
    if (!withPos.length || !cameraRef.current) return;
    if (withPos.length === 1) {
      cameraRef.current.setCamera({
        centerCoordinate: [withPos[0].latest!.lng, withPos[0].latest!.lat],
        zoomLevel: 12, animationDuration: 800,
      });
    } else {
      const lngs = withPos.map((r) => r.latest!.lng);
      const lats = withPos.map((r) => r.latest!.lat);
      cameraRef.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [80, 80, 80, 80], 800
      );
    }
  }, [riders]);

  async function handleEndEvent() {
    Alert.alert("End Event", "Mark this event as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Event", style: "destructive",
        onPress: async () => {
          setUpdatingStatus(true);
          const session = await getSession();
          if (!session) return;
          await fetch(`${WEB_BASE}/api/events/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ status: "completed" }),
          });
          await load();
          setUpdatingStatus(false);
        },
      },
    ]);
  }

  async function shareJoinCode() {
    if (!event) return;
    await Share.share({
      message: `Join my Waypoint group ride "${event.name}"!\nEnter code: ${event.join_code}\n\nOr follow along live: ${WEB_BASE}/event/${event.share_token}`,
    });
  }

  async function openMyGepLink() {
    if (!myGepToken || !event) return;
    const url = `${WEB_BASE}/api/events/${event.id}/gep/${myGepToken}/network-link.kml`;
    Alert.alert(
      "Your GEP Link",
      "This link is personalised to you. In Google Earth Pro: Add → Network Link → paste the URL in the Link field. Do not share it — if it leaks, the organizer can trace it back.",
      [{ text: "Share Link", onPress: () => Share.share({ message: url, url }) },
       { text: "OK" }]
    );
  }

  async function addCredential() {
    const name = newCredName.trim();
    if (!name) return;
    setAddingCred(true);
    const session = await getSession();
    if (!session) { setAddingCred(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events/${id}/gep-credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ display_name: name }),
    });

    if (res.ok) {
      const cred: GepCredential = await res.json();
      setGepCredentials((prev) => [...prev, cred]);
      setNewCredName("");
    } else {
      const err = await res.json();
      Alert.alert("Error", err.error ?? "Failed to create viewer");
    }
    setAddingCred(false);
  }

  async function shareCredential(cred: GepCredential) {
    if (!event) return;
    const url = `${WEB_BASE}/api/events/${event.id}/gep/${cred.gep_token}/network-link.kml`;
    await Share.share({
      message: `Hi ${cred.display_name}! Here is your personal Google Earth Pro link for "${event.name}":\n\n${url}\n\nIn Google Earth Pro: Add → Network Link → paste the URL above in the Link field. Auto-refreshes live. Do not share this link — it is unique to you.`,
      url,
    });
  }

  async function deleteCredential(cred: GepCredential) {
    Alert.alert(
      "Revoke GEP Link",
      `Revoke ${cred.display_name}'s link? Their KML will stop working immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke", style: "destructive",
          onPress: async () => {
            const session = await getSession();
            if (!session) return;
            const res = await fetch(`${WEB_BASE}/api/events/${id}/gep-credentials/${cred.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
              setGepCredentials((prev) => prev.filter((c) => c.id !== cred.id));
            }
          },
        },
      ]
    );
  }

  if (loading) return (
    <View className="flex-1 bg-surface-soft items-center justify-center">
      <ActivityIndicator color="#1c69d4" />
    </View>
  );
  if (!event) return (
    <View className="flex-1 bg-surface-soft items-center justify-center">
      <Text className="text-muted">Event not found</Text>
    </View>
  );

  const isLive = event.status === "active";
  const ridersWithPos = riders.filter((r) => r.latest);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 bg-surface-soft">
        {/* Status bar */}
        <View style={{ backgroundColor: "#1a2129", paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View className="flex-row items-center gap-2">
            {isLive && <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{event.name}</Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={shareJoinCode}
              style={{ borderWidth: 1, borderColor: "#3a4550", paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ color: "#bbbbbb", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
                SHARE {event.join_code}
              </Text>
            </TouchableOpacity>
            {isOrganizer && isLive && (
              <TouchableOpacity
                onPress={handleEndEvent}
                disabled={updatingStatus}
                style={{ borderWidth: 1, borderColor: "#cc3300", paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Text style={{ color: "#cc3300", fontSize: 10, fontWeight: "700" }}>END</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-hairline bg-canvas">
          {(["map", "riders", "gep"] as TabId[]).map((t) => (
            <TouchableOpacity
              key={t}
              className="flex-1 py-3 items-center"
              style={{ borderBottomWidth: tab === t ? 2 : 0, borderBottomColor: "#1c69d4" }}
              onPress={() => setTab(t)}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: tab === t ? "#1c69d4" : "#6b6b6b" }}>
                {t === "map" ? "Map" : t === "riders" ? `Riders (${riders.length})` : "GEP"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── MAP TAB ── */}
        {tab === "map" && (
          <View style={{ flex: 1 }}>
            <MapView
              style={{ flex: 1 }}
              styleURL="mapbox://styles/mapbox/outdoors-v12"
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [-105, 40], zoomLevel: 4 }} />

              {/* GPX planned route */}
              {event.route_gpx && (() => {
                try {
                  const matches = [...event.route_gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g)];
                  const coords = matches.map((m) => [parseFloat(m[2]), parseFloat(m[1])]);
                  if (coords.length < 2) return null;
                  const geojson = { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: coords }, properties: {} };
                  return (
                    <ShapeSource id="planned-route" shape={geojson}>
                      <LineLayer
                        id="planned-route-line"
                        style={{ lineColor: "#22c55e", lineWidth: 3, lineDasharray: [2, 2], lineJoin: "round", lineCap: "round" }}
                      />
                    </ShapeSource>
                  );
                } catch { return null; }
              })()}

              {riders.map((rider, i) => {
                const color = RIDER_COLORS[i % RIDER_COLORS.length];
                const trackCoords = rider.track.map((p) => [p.lng, p.lat]);
                return (
                  <MapboxFragment key={rider.id}>
                    {trackCoords.length > 1 && (
                      <ShapeSource
                        id={`track-${rider.id}`}
                        shape={{ type: "Feature", geometry: { type: "LineString", coordinates: trackCoords }, properties: {} }}
                      >
                        <LineLayer
                          id={`track-line-${rider.id}`}
                          style={{ lineColor: color, lineWidth: 2.5, lineJoin: "round", lineCap: "round" }}
                        />
                      </ShapeSource>
                    )}
                    {rider.latest && (
                      <MarkerView id={`marker-${rider.id}`} coordinate={[rider.latest.lng, rider.latest.lat]}>
                        <View style={{
                          width: 34, height: 34, borderRadius: 17,
                          backgroundColor: color, borderWidth: 3, borderColor: "#fff",
                          alignItems: "center", justifyContent: "center",
                          shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
                        }}>
                          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
                            {rider.display_name.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      </MarkerView>
                    )}
                  </MapboxFragment>
                );
              })}
            </MapView>

            <View style={{ position: "absolute", bottom: 16, left: 16, backgroundColor: "rgba(26,33,41,0.85)", paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                {ridersWithPos.length} / {riders.length} riders on map
              </Text>
            </View>
          </View>
        )}

        {/* ── RIDERS TAB ── */}
        {tab === "riders" && (
          <ScrollView
            className="flex-1"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1c69d4" />}
          >
            <View className="pt-4 pb-10">
              <View className="border-t border-hairline">
                {riders.map((rider, i) => {
                  const color = RIDER_COLORS[i % RIDER_COLORS.length];
                  const minsAgo = rider.latest
                    ? Math.round((Date.now() - new Date(rider.latest.recorded_at).getTime()) / 60000)
                    : null;
                  return (
                    <View
                      key={rider.id}
                      className="bg-canvas border-b border-hairline px-5 py-4 flex-row items-center gap-3"
                      style={{ borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>
                          {rider.display_name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-ink font-bold text-sm">
                          {rider.display_name}{rider.role === "organizer" ? " ★" : ""}
                        </Text>
                        {rider.latest ? (
                          <Text className="text-muted font-light text-xs mt-0.5">
                            {rider.latest.speed_kmh?.toFixed(0) ?? "?"} km/h
                            {minsAgo !== null && minsAgo > 10
                              ? <Text className="text-amber-500"> · {timeAgo(rider.latest.recorded_at)}</Text>
                              : ` · ${timeAgo(rider.latest.recorded_at)}`
                            }
                          </Text>
                        ) : (
                          <Text className="text-muted-soft font-light text-xs mt-0.5">No position yet</Text>
                        )}
                      </View>
                      {rider.latest && (
                        <TouchableOpacity
                          onPress={() => {
                            setTab("map");
                            setTimeout(() => {
                              cameraRef.current?.setCamera({
                                centerCoordinate: [rider.latest!.lng, rider.latest!.lat],
                                zoomLevel: 13, animationDuration: 600,
                              });
                            }, 100);
                          }}
                          style={{ borderWidth: 1, borderColor: "#e6e6e6", paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#6b6b6b", letterSpacing: 0.5 }}>FIND</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── GEP TAB ── */}
        {tab === "gep" && (
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
            <View className="pt-6 pb-10">

              {/* Your personal GEP link (all participants) */}
              <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Your GEP Link</Text>
              <View className="border-t border-b border-hairline">
                <View className="bg-canvas px-6 py-4">
                  <Text className="text-ink font-light text-sm mb-3">
                    Open this in Google Earth Pro to see all riders live. Do not share it — if it leaks, the organizer can trace it back to you.
                  </Text>
                  <TouchableOpacity
                    className="bg-primary py-3 items-center"
                    style={{ borderRadius: 0 }}
                    onPress={openMyGepLink}
                  >
                    <Text className="text-on-primary font-bold text-xs tracking-widest uppercase">Get My GEP Link</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── GEP Viewers (organizer only) ── */}
              {isOrganizer && (
                <>
                  <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">
                    GEP Viewers
                  </Text>
                  <View className="border-t border-hairline">
                    {/* Context */}
                    <View className="bg-canvas border-b border-hairline px-6 py-3">
                      <Text className="text-muted font-light text-xs">
                        Issue a named link to anyone who should follow along in Google Earth Pro — safety marshals, sponsors, crew. Each link is unique and traceable. Revoking it immediately kills their feed.
                      </Text>
                    </View>

                    {/* Existing credentials */}
                    {gepCredentials.map((cred) => (
                      <View
                        key={cred.id}
                        className="bg-canvas border-b border-hairline px-6 py-4 flex-row items-center gap-3"
                      >
                        <View className="flex-1">
                          <Text className="text-ink font-bold text-sm">{cred.display_name}</Text>
                          <Text className="text-muted-soft font-light text-xs mt-0.5">
                            Token: …{cred.gep_token.slice(-8)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => shareCredential(cred)}
                          style={{ borderWidth: 1, borderColor: "#1c69d4", paddingHorizontal: 10, paddingVertical: 5, marginRight: 6 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#1c69d4", letterSpacing: 0.5 }}>SHARE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deleteCredential(cred)}
                          style={{ borderWidth: 1, borderColor: "#cc3300", paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#cc3300", letterSpacing: 0.5 }}>REVOKE</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Add new credential */}
                    <View className="bg-canvas border-b border-hairline px-6 py-4">
                      <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-2">Add Viewer</Text>
                      <View className="flex-row gap-3 items-center">
                        <TextInput
                          value={newCredName}
                          onChangeText={setNewCredName}
                          placeholder="First Last"
                          placeholderTextColor="#9a9a9a"
                          autoCapitalize="words"
                          returnKeyType="done"
                          onSubmitEditing={addCredential}
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: "#d4d4d4",
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            fontSize: 14,
                            color: "#1a1a1a",
                            backgroundColor: "#fff",
                          }}
                        />
                        <TouchableOpacity
                          onPress={addCredential}
                          disabled={addingCred || !newCredName.trim()}
                          style={{
                            backgroundColor: newCredName.trim() ? "#1c69d4" : "#d4d4d4",
                            paddingHorizontal: 16, paddingVertical: 10,
                          }}
                        >
                          {addingCred
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.5 }}>ADD</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Planned Route */}
                  <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Planned Route</Text>
                  <View className="border-t border-b border-hairline">
                    <View className="bg-canvas px-6 py-4">
                      {event.route_name ? (
                        <View>
                          <Text className="text-ink font-bold text-sm mb-1">📍 {event.route_name}</Text>
                          <Text className="text-muted font-light text-xs mb-3">
                            Shown as a dashed green line on the group map and in all GEP feeds.
                          </Text>
                          <TouchableOpacity
                            onPress={async () => {
                              Alert.alert("Remove Route", "Remove the planned route from this event?", [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove", style: "destructive", onPress: async () => {
                                    const session = await getSession();
                                    if (!session) return;
                                    await fetch(`${WEB_BASE}/api/events/${id}/route-gpx`, {
                                      method: "DELETE",
                                      headers: { Authorization: `Bearer ${session.access_token}` },
                                    });
                                    await load();
                                  },
                                },
                              ]);
                            }}
                            style={{ borderWidth: 1, borderColor: "#e6e6e6", paddingVertical: 8, alignItems: "center" }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b6b6b", letterSpacing: 0.5 }}>REMOVE ROUTE</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View>
                          <Text className="text-muted font-light text-sm mb-3">
                            Upload a .gpx file to show the planned route on the group map and in Google Earth Pro.
                          </Text>
                          <Text className="text-muted-soft font-light text-xs">
                            To upload, use the web dashboard at{"\n"}
                            <Text className="text-primary" onPress={() => Linking.openURL(`${WEB_BASE}/event/${event.share_token}`)}>
                              {WEB_BASE}/event/{event.share_token}
                            </Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* GEP Access Log */}
                  <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Access Log</Text>
                  <View className="border-t border-b border-hairline">
                    {gepAccessLog.length === 0 ? (
                      <View className="bg-canvas px-6 py-4">
                        <Text className="text-muted font-light text-sm">No GEP accesses yet.</Text>
                      </View>
                    ) : (
                      gepAccessLog.map((entry, i) => (
                        <View key={i} className="bg-canvas border-b border-hairline px-6 py-4">
                          <View className="flex-row justify-between items-start">
                            <View className="flex-1">
                              <Text className="text-ink font-bold text-sm">{entry.display_name}</Text>
                              <Text style={{ fontSize: 10, color: "#9a9a9a", marginTop: 1 }}>
                                {entry.type === "credential" ? "GEP Viewer" : entry.role === "organizer" ? "Organizer" : "Rider"}
                              </Text>
                            </View>
                            <Text className="text-muted font-light text-xs">{entry.access_count}×</Text>
                          </View>
                          <Text className="text-muted font-light text-xs mt-1">
                            Last: {entry.last_ip} · {entry.unique_ips.length} unique IP{entry.unique_ips.length !== 1 ? "s" : ""}
                          </Text>
                          {entry.unique_ips.length > 1 && (
                            <Text className="text-amber-600 font-bold text-xs mt-1">
                              ⚠ Multiple IPs — link may have been shared
                            </Text>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}

            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
