import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";

/**
 * Past rides. Replaces the old Trips tab, which also owned trip *creation* —
 * that moved to Track, where choosing "Personal ride" makes the trip for you.
 * This screen only looks backwards.
 */

type Trip = {
  id: string;
  name: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

function when(t: Trip): string {
  const iso = t.started_at ?? t.created_at;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function duration(t: Trip): string | null {
  if (!t.started_at || !t.ended_at) return null;
  const ms = new Date(t.ended_at).getTime() - new Date(t.started_at).getTime();
  if (!isFinite(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function HistoryScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTrips([]); setLoading(false); return; }

    const { data, error: err } = await supabase
      .from("trips")
      .select("id, name, status, started_at, ended_at, created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (err) setError(err.message);
    else setTrips((data as Trip[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View className="flex-1 bg-surface-dark items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-dark">
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor="#7E93A0"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-8 py-20">
            <Text className="text-on-dark font-bold text-base mb-2">No rides yet</Text>
            <Text className="text-on-dark-soft text-sm text-center leading-5">
              Start tracking from the Track tab and your rides will collect here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const dur = duration(item);
          const live = item.status === "active";
          return (
            <TouchableOpacity
              className="bg-surface-dark-elevated rounded-xl p-4 mb-2 flex-row items-center"
              onPress={() => router.push({ pathname: "/(tabs)", params: { tripId: item.id } })}
            >
              <View className="flex-1 pr-3">
                <Text className="text-white text-base font-semibold" numberOfLines={1}>
                  {item.name || "Untitled ride"}
                </Text>
                <Text className="text-on-dark-soft text-xs mt-1">
                  {when(item)}
                  {dur ? ` · ${dur}` : ""}
                </Text>
              </View>
              {live && (
                <View className="bg-primary rounded-full px-3 py-1">
                  <Text className="text-on-primary text-xs font-bold tracking-wider">LIVE</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
      {error ? (
        <Text className="text-red-400 text-sm px-6 pb-4">{error}</Text>
      ) : null}
    </View>
  );
}
