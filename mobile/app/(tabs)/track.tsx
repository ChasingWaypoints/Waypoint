import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  startBeacon,
  stopBeacon,
  getBeaconStatus,
  syncNow,
  type Tier,
} from "../../lib/backgroundTracking";
import {
  fetchBeaconState,
  fetchBeaconEvents,
  type BeaconState,
} from "../../lib/deviceIdentity";

const TIER_OPTIONS: { label: string; value: Tier; battery: string }[] = [
  { label: "Race", value: "race", battery: "30 s · high drain" },
  { label: "Trail", value: "trail", battery: "1 min · moderate" },
  { label: "Idle", value: "idle", battery: "5 min · low" },
  { label: "Parked", value: "parked", battery: "15 min · minimal" },
];

export default function TrackScreen() {
  const [tracking, setTracking] = useState(false);
  const [tier, setTier] = useState<Tier>("trail");
  const [activeTrip, setActiveTrip] = useState<{ id: string; name: string } | null>(null);
  const [queued, setQueued] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [beacon, setBeacon] = useState<BeaconState | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    const s = await getBeaconStatus();
    setTracking(s.active);
    setQueued(s.queued);
    if (s.active) setTier(s.tier);
  }, []);

  const refreshBeacon = useCallback(async () => {
    try {
      const s = await fetchBeaconState();
      setBeacon(s);
      if (s.ok && s.claimed && s.active_event_id) {
        // beacon_state reports which event is selected but not the roster row
        // it maps to; the events list carries that.
        const evs = await fetchBeaconEvents();
        const match = evs.find((e) => e.event_id === s.active_event_id);
        setParticipantId(match?.participant_id ?? null);
      } else {
        setParticipantId(null);
      }
    } catch {
      // Offline is fine — a previously started session keeps running.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchActiveTrip();
      refreshStatus();
      refreshBeacon();
      // While this screen is open, keep the queue counter honest.
      pollRef.current = setInterval(refreshStatus, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [refreshStatus, refreshBeacon])
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function fetchActiveTrip() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("trips")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveTrip(data ?? null);
  }

  const eventMode = !!(beacon?.claimed && beacon.active_event_id && participantId);

  async function handleStart() {
    setError("");

    // An event selected on the beacon screen wins: that is the rider saying
    // "put me on the map", and it is the whole reason the app exists.
    if (eventMode) {
      try {
        await startBeacon(
          {
            mode: "event",
            eventId: beacon!.active_event_id!,
            participantId: participantId!,
            eventName: beacon!.active_event_name ?? undefined,
          },
          tier === "trail" ? "race" : tier
        );
        await refreshStatus();
      } catch (err: any) {
        setError(err?.message ?? "Could not start tracking.");
      }
      return;
    }

    if (!activeTrip) {
      setError(
        beacon?.claimed
          ? "Pick an event under Settings → Use This Phone as a Beacon, or start a trip from the Trips tab."
          : "No active trip. Start a trip from the Trips tab, or link this phone under Settings → Use This Phone as a Beacon."
      );
      return;
    }
    try {
      await startBeacon({ mode: "trip", tripId: activeTrip.id }, tier);
      await refreshStatus();
    } catch (err: any) {
      setError(err?.message ?? "Could not start tracking.");
    }
  }

  async function handleStop() {
    try {
      await stopBeacon();
    } catch (err: any) {
      setError(err?.message ?? "Could not stop tracking.");
    }
    await refreshStatus();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncNow();
      setQueued(r.remaining);
      if (r.sent > 0) setLastSync(new Date());
      if (r.skipped === "offline") setError("No connection — points are safe in the queue.");
      else setError("");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-surface-dark">
      <View className="px-6 pt-6 pb-10">

        {/* Where this session's points are going */}
        <View className="bg-surface-dark-elevated rounded-xl p-4 mb-5">
          <Text className="text-on-dark-soft text-xs uppercase font-bold mb-1">Tracking for</Text>
          {eventMode ? (
            <>
              <Text className="text-white text-base font-semibold">
                {beacon?.active_event_name ?? "Selected event"}
              </Text>
              <Text className="text-on-dark-soft text-xs mt-1">
                You'll appear on the organizer's live map
              </Text>
            </>
          ) : activeTrip ? (
            <>
              <Text className="text-white text-base font-semibold">{activeTrip.name}</Text>
              <Text className="text-on-dark-soft text-xs mt-1">Personal trip — private to you</Text>
            </>
          ) : (
            <Text className="text-on-dark-soft text-sm">
              Nothing selected — pick an event under Settings, or start a trip from the Trips tab
            </Text>
          )}
        </View>

        {/* Tracking status */}
        <View className={`rounded-xl p-5 mb-5 items-center ${tracking ? "bg-primary/20" : "bg-surface-dark-elevated"}`}>
          <View className={`w-3 h-3 rounded-full mb-3 ${tracking ? "bg-emerald-400" : "bg-slate-600"}`} />
          <Text className={`text-lg font-bold mb-1 ${tracking ? "text-emerald-400" : "text-on-dark-soft"}`}>
            {tracking ? "Tracking Active" : "Not Tracking"}
          </Text>
          {tracking && (
            <Text className="text-emerald-300 text-xs mt-1">
              Recording in the background · {TIER_OPTIONS.find((t) => t.value === tier)?.label}
            </Text>
          )}
          {lastSync && (
            <Text className="text-on-dark-soft text-xs mt-1">
              Last upload {lastSync.toLocaleTimeString()}
            </Text>
          )}
        </View>

        {/* Offline queue — the thing that tells a rider nothing was lost */}
        <View className="bg-surface-dark-elevated rounded-xl p-4 mb-5 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-on-dark-soft text-xs uppercase font-bold mb-1">Waiting to upload</Text>
            <Text className="text-white text-base font-semibold">
              {queued === 0 ? "All caught up" : `${queued} point${queued === 1 ? "" : "s"} queued`}
            </Text>
            {queued > 0 && (
              <Text className="text-on-dark-soft text-xs mt-1">
                Saved on this phone. They upload as soon as you have signal.
              </Text>
            )}
          </View>
          <TouchableOpacity
            className={`rounded-lg px-4 py-2 ${queued > 0 ? "bg-primary" : "bg-surface-dark"}`}
            onPress={handleSync}
            disabled={syncing || queued === 0}
          >
            <Text className={`font-bold text-sm ${queued > 0 ? "text-white" : "text-on-dark-soft"}`}>
              {syncing ? "Syncing…" : "Sync"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Cadence selector */}
        {!tracking && (
          <View className="mb-5">
            <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3">Update Rate</Text>
            <View className="flex-row gap-2 flex-wrap">
              {TIER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setTier(opt.value)}
                  className={`flex-1 rounded-xl p-3 items-center min-w-16 ${tier === opt.value ? "bg-primary" : "bg-surface-dark-elevated"}`}
                >
                  <Text className={`font-bold text-sm ${tier === opt.value ? "text-white" : "text-on-dark"}`}>
                    {opt.label}
                  </Text>
                  <Text className={`text-xs mt-0.5 ${tier === opt.value ? "text-emerald-100" : "text-on-dark-soft"}`}>
                    {opt.battery}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-on-dark-soft text-xs mt-3">
              Waypoint slows the rate on its own when you stop moving, and speeds it back up when you ride.
            </Text>
          </View>
        )}

        {/* Error */}
        {error ? <Text className="text-red-400 text-sm mb-4">{error}</Text> : null}

        {/* Main button */}
        <TouchableOpacity
          className={`rounded-xl py-5 items-center ${tracking ? "bg-red-500/80" : "bg-primary"}`}
          onPress={tracking ? handleStop : handleStart}
        >
          <Text className="text-white font-bold text-lg">
            {tracking ? "Stop Tracking" : "Start Tracking"}
          </Text>
        </TouchableOpacity>

        {/* Web notice */}
        {Platform.OS === "web" && (
          <Text className="text-on-dark-soft text-xs text-center mt-4">
            GPS accuracy is limited in browser. Install the app for full background tracking.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
