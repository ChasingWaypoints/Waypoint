import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { supabase } from "../../lib/supabase";

interface Trip {
  id: string;
  name: string;
  status: "planning" | "active" | "completed" | "archived";
  is_public: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

type FilterTab = "active" | "recent" | "all";

const STATUS_COLORS: Record<string, string> = {
  active:    "#22c55e",
  planning:  "#1c69d4",
  completed: "#6b6b6b",
  archived:  "#9a9a9a",
};

export default function TripsScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => { loadTrips(); }, []);

  async function loadTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("trips")
      .select("id, name, status, is_public, started_at, ended_at, created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setTrips(data);
    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTrips();
  }, []);

  async function createTrip() {
    setCreateError("");
    if (!newName.trim()) { setCreateError("Please enter a trip name."); return; }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("trips")
      .insert({ user_id: user.id, name: newName.trim(), status: "active", is_public: false })
      .select()
      .single();

    if (error) { setCreateError(error.message); }
    else if (data) {
      setTrips((prev) => [data, ...prev]);
      setShowModal(false);
      setNewName("");
    }
    setCreating(false);
  }

  async function updateStatus(id: string, status: string) {
    const updates: Record<string, unknown> = { status };
    if (status === "active") updates.started_at = new Date().toISOString();
    if (status === "completed") updates.ended_at = new Date().toISOString();
    await supabase.from("trips").update(updates).eq("id", id);
    setTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } as Trip : t));
  }

  async function deleteTrip(id: string) {
    await supabase.from("trips").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }

  const filtered = trips.filter((t) => {
    if (filter === "active") return t.status === "active" || t.status === "planning";
    if (filter === "recent") return t.status === "completed";
    return true;
  });

  return (
    <View className="flex-1 bg-surface-soft">

      {/* Filter tabs */}
      <View className="bg-canvas border-b border-hairline flex-row px-6">
        {(["active", "recent", "all"] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            className={`mr-6 py-3 border-b-2 ${filter === tab ? "border-primary" : "border-transparent"}`}
          >
            <Text className={`text-xs font-bold uppercase tracking-widest ${filter === tab ? "text-primary" : "text-muted"}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-6 pt-5 pb-10">

          {loading ? (
            <ActivityIndicator color="#1c69d4" style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View className="border border-hairline bg-canvas p-8 items-center mt-2">
              <Text className="text-ink font-bold text-base mb-2">
                {filter === "active" ? "No active trips" : "No trips found"}
              </Text>
              <Text className="text-muted font-light text-sm text-center mb-6">
                {filter === "active"
                  ? "Start a new trip to begin tracking your adventure."
                  : "Your completed trips will appear here."}
              </Text>
              <TouchableOpacity
                className="bg-primary px-8 py-3.5"
                style={{ borderRadius: 0 }}
                onPress={() => setShowModal(true)}
              >
                <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Start a Trip</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {filtered.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onUpdateStatus={updateStatus}
                  onDelete={deleteTrip}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      {!loading && (
        <View className="px-6 pb-6 bg-canvas border-t border-hairline">
          <TouchableOpacity
            className="bg-primary py-4 items-center mt-4"
            style={{ borderRadius: 0 }}
            onPress={() => setShowModal(true)}
          >
            <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">+ Start New Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Create trip modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-canvas px-6 pt-10">
          <View className="flex-row justify-between items-center mb-8">
            <Text className="text-ink text-xl font-bold">New Trip</Text>
            <TouchableOpacity onPress={() => { setShowModal(false); setNewName(""); setCreateError(""); }}>
              <Text className="text-muted text-sm uppercase font-bold tracking-wider">Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Trip Name</Text>
          <TextInput
            className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light mb-2"
            placeholder="e.g. Sacramento to Tahoe"
            placeholderTextColor="#9a9a9a"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            style={{ borderRadius: 0 }}
          />

          {createError ? (
            <Text className="text-error text-sm font-light mb-4">{createError}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-primary py-4 items-center mt-4"
            style={{ borderRadius: 0 }}
            onPress={createTrip}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Start Tracking</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function TripCard({ trip, onUpdateStatus, onDelete }: {
  trip: Trip;
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[trip.status] ?? "#9a9a9a";

  return (
    <View className="bg-canvas border border-hairline mb-3">
      <TouchableOpacity
        className="px-4 pt-4 pb-3"
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-ink font-bold text-base mb-1">{trip.name}</Text>
            <Text className="text-muted font-light text-xs">
              {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
            <Text style={{ color: statusColor, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
              {trip.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View className="px-4 pb-4 border-t border-hairline pt-3 flex-row gap-2 flex-wrap">
          {trip.status === "planning" && (
            <ActionButton label="Start" onPress={() => onUpdateStatus(trip.id, "active")} primary />
          )}
          {trip.status === "active" && (
            <ActionButton label="Complete" onPress={() => onUpdateStatus(trip.id, "completed")} primary />
          )}
          {trip.status === "completed" && (
            <ActionButton label="Archive" onPress={() => onUpdateStatus(trip.id, "archived")} />
          )}
          <ActionButton label="Delete" onPress={() => onDelete(trip.id)} danger />
        </View>
      )}
    </View>
  );
}

function ActionButton({ label, onPress, primary, danger }: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean;
}) {
  const bg = danger ? "transparent" : primary ? "#1c69d4" : "#f7f7f7";
  const color = danger ? "#dc2626" : primary ? "#fff" : "#262626";
  const border = danger ? "#fecaca" : primary ? "#1c69d4" : "#e6e6e6";

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ backgroundColor: bg, borderWidth: 1, borderColor: border, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 0 }}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
