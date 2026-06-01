import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";

const INTERVALS = [
  { label: "1 min", value: 60, battery: "High drain" },
  { label: "5 min", value: 300, battery: "Moderate" },
  { label: "15 min", value: 900, battery: "Low drain" },
  { label: "30 min", value: 1800, battery: "Minimal" },
];

export default function TrackScreen() {
  const [tracking, setTracking] = useState(false);
  const [interval, setInterval] = useState(300); // default 5 min
  const [activeTrip, setActiveTrip] = useState<{ id: string; name: string } | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkPermissions();
    fetchActiveTrip();
  }, []);

  async function checkPermissions() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionGranted(status === "granted");
  }

  async function fetchActiveTrip() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("trips")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (data) setActiveTrip(data);
  }

  async function sendLocation() {
    if (!activeTrip) return;
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("track_points").insert({
        trip_id: activeTrip.id,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        altitude_m: location.coords.altitude,
        speed_kmh: location.coords.speed ? location.coords.speed * 3.6 : null,
        accuracy_m: location.coords.accuracy,
        source: "phone",
        recorded_at: new Date(location.timestamp).toISOString(),
      });

      setPointCount((c) => c + 1);
      setLastPing(new Date());
    } catch (err) {
      console.error("Location error:", err);
    }
  }

  function startTracking() {
    if (!permissionGranted) {
      setError("Location permission required. Please enable it in Settings.");
      return;
    }
    if (!activeTrip) {
      setError("No active trip. Start a trip from the Trips tab first.");
      return;
    }
    setError("");
    setTracking(true);
    sendLocation(); // immediate first ping
    scheduleNext();
  }

  function scheduleNext() {
    timerRef.current = setTimeout(() => {
      sendLocation();
      scheduleNext();
    }, interval * 1000);
  }

  function stopTracking() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTracking(false);
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <ScrollView className="flex-1 bg-slate-900">
      <View className="px-6 pt-6 pb-10">

        {/* Active trip indicator */}
        <View className="bg-slate-800 rounded-xl p-4 mb-5">
          <Text className="text-slate-400 text-xs uppercase font-bold mb-1">Active Trip</Text>
          {activeTrip ? (
            <Text className="text-white text-base font-semibold">{activeTrip.name}</Text>
          ) : (
            <Text className="text-slate-500 text-sm">No active trip — start one from Trips tab</Text>
          )}
        </View>

        {/* Tracking status */}
        <View className={`rounded-xl p-5 mb-5 items-center ${tracking ? "bg-emerald-500/20" : "bg-slate-800"}`}>
          <View className={`w-3 h-3 rounded-full mb-3 ${tracking ? "bg-emerald-400" : "bg-slate-600"}`} />
          <Text className={`text-lg font-bold mb-1 ${tracking ? "text-emerald-400" : "text-slate-400"}`}>
            {tracking ? "Tracking Active" : "Not Tracking"}
          </Text>
          {tracking && lastPing && (
            <Text className="text-emerald-300 text-xs mt-1">
              Last ping: {lastPing.toLocaleTimeString()} · {pointCount} points sent
            </Text>
          )}
        </View>

        {/* Interval selector */}
        {!tracking && (
          <View className="mb-5">
            <Text className="text-slate-400 text-xs uppercase font-bold mb-3">Update Interval</Text>
            <View className="flex-row gap-2 flex-wrap">
              {INTERVALS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setInterval(opt.value)}
                  className={`flex-1 rounded-xl p-3 items-center min-w-16 ${interval === opt.value ? "bg-emerald-500" : "bg-slate-800"}`}
                >
                  <Text className={`font-bold text-sm ${interval === opt.value ? "text-white" : "text-slate-300"}`}>
                    {opt.label}
                  </Text>
                  <Text className={`text-xs mt-0.5 ${interval === opt.value ? "text-emerald-100" : "text-slate-500"}`}>
                    {opt.battery}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Error */}
        {error ? <Text className="text-red-400 text-sm mb-4">{error}</Text> : null}

        {/* Main button */}
        <TouchableOpacity
          className={`rounded-xl py-5 items-center ${tracking ? "bg-red-500/80" : "bg-emerald-500"}`}
          onPress={tracking ? stopTracking : startTracking}
        >
          <Text className="text-white font-bold text-lg">
            {tracking ? "Stop Tracking" : "Start Tracking"}
          </Text>
        </TouchableOpacity>

        {/* Web notice */}
        {Platform.OS === "web" && (
          <Text className="text-slate-500 text-xs text-center mt-4">
            GPS accuracy is limited in browser. Install the app for full background tracking.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
