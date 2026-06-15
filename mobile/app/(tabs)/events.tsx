import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";

interface EventItem {
  id: string;
  name: string;
  status: string;
  join_code: string;
  share_token: string;
  starts_at: string | null;
  my_role: string;
  joined_at: string;
}

export default function EventsScreen() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const res = await fetch(`${WEB_BASE}/api/events`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setEvents(data);
    }
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const active = events.filter((e) => e.status === "active");
  const past = events.filter((e) => e.status !== "active");

  return (
    <ScrollView
      className="flex-1 bg-surface-soft"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1c69d4" />}
    >
      <View className="pt-6 pb-10">

        {/* Action buttons */}
        <View className="px-6 flex-row gap-3 mb-6">
          <TouchableOpacity
            className="flex-1 bg-primary py-3 items-center"
            style={{ borderRadius: 0 }}
            onPress={() => router.push("/events/create")}
          >
            <Text className="text-on-primary font-bold text-xs tracking-widest uppercase">+ Create Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 border border-primary py-3 items-center"
            style={{ borderRadius: 0 }}
            onPress={() => router.push("/events/join")}
          >
            <Text className="text-primary font-bold text-xs tracking-widest uppercase">Join with Code</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#1c69d4" style={{ marginTop: 20 }} />
        ) : events.length === 0 ? (
          <View className="mx-6 border border-hairline bg-canvas p-6 items-center">
            <Text className="text-ink font-bold text-sm mb-2">No events yet</Text>
            <Text className="text-muted font-light text-xs text-center">
              Create an event to track a group ride, or join one with a code from the organizer.
            </Text>
          </View>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Active</Text>
                <View className="border-t border-hairline">
                  {active.map((ev) => <EventRow key={ev.id} event={ev} />)}
                </View>
              </>
            )}
            {past.length > 0 && (
              <>
                <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Past</Text>
                <View className="border-t border-hairline">
                  {past.map((ev) => <EventRow key={ev.id} event={ev} />)}
                </View>
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function EventRow({ event }: { event: EventItem }) {
  return (
    <TouchableOpacity
      className="bg-canvas border-b border-hairline px-6 py-4 flex-row items-center justify-between"
      onPress={() => router.push(`/events/${event.id}`)}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2 mb-0.5">
          {event.status === "active" && (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" }} />
          )}
          <Text className="text-ink font-bold text-sm">{event.name}</Text>
        </View>
        <Text className="text-muted font-light text-xs">
          {event.my_role === "organizer" ? "Organizer" : "Rider"} · Code: {event.join_code}
        </Text>
      </View>
      <Text className="text-muted text-lg ml-3">›</Text>
    </TouchableOpacity>
  );
}
