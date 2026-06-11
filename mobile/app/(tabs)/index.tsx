import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { supabase } from "../../lib/supabase";
import ShareSheet from "../../components/ShareSheet";

interface Trip {
  id: string;
  name: string;
  status: "planning" | "active" | "completed" | "archived";
  is_public: boolean;
  share_token: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  device_id: string | null;
}

interface Device {
  id: string;
  name: string;
  type: string;
}

type FilterTab = "active" | "recent" | "all";

const STATUS_COLORS: Record<string, string> = {
  active:    "#22c55e",
  planning:  "#1c69d4",
  completed: "#6b6b6b",
  archived:  "#9a9a9a",
};

const DEVICE_ICONS: Record<string, string> = {
  garmin: "🛰",
  spot:   "📡",
  zoleo:  "🔵",
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null); // null = Phone GPS

  useEffect(() => { loadTrips(); loadDevices(); }, []);

  async function loadTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("trips")
      .select("id, name, status, is_public, share_token, started_at, ended_at, created_at, device_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setTrips(data);
    setLoading(false);
    setRefreshing(false);
  }

  async function loadDevices() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("devices")
      .select("id, name, type")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (data) setDevices(data);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTrips();
  }, []);

  function openModal() {
    setNewName("");
    setSelectedDeviceId(null);
    setCreateError("");
    setShowModal(true);
  }

  async function createTrip() {
    setCreateError("");
    if (!newName.trim()) { setCreateError("Please enter a trip name."); return; }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: user.id,
        name: newName.trim(),
        status: "active",
        is_public: false,
        device_id: selectedDeviceId ?? null,
      })
      .select()
      .single();

    if (error) { setCreateError(error.message); }
    else if (data) {
      setTrips((prev) => [data, ...prev]);
      setShowModal(false);
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
                onPress={openModal}
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
                  devices={devices}
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
            onPress={openModal}
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
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text className="text-muted text-sm uppercase font-bold tracking-wider">Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Trip Name */}
          <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Trip Name</Text>
          <TextInput
            className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light mb-6"
            placeholder="e.g. Sacramento to Tahoe"
            placeholderTextColor="#9a9a9a"
            value={newName}
            onChangeText={setNewName}
            autoFocus
            style={{ borderRadius: 0 }}
          />

          {/* Tracking Source */}
          <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-3">Tracking Source</Text>

          {/* Phone GPS option */}
          <TouchableOpacity
            onPress={() => setSelectedDeviceId(null)}
            style={{
              flexDirection: "row", alignItems: "center",
              borderWidth: 1,
              borderColor: selectedDeviceId === null ? "#1c69d4" : "#e6e6e6",
              backgroundColor: selectedDeviceId === null ? "#e8f0fb" : "#fff",
              padding: 14, marginBottom: 8,
            }}
          >
            <View style={{
              width: 18, height: 18, borderRadius: 9, borderWidth: 2,
              borderColor: selectedDeviceId === null ? "#1c69d4" : "#9a9a9a",
              marginRight: 12, alignItems: "center", justifyContent: "center",
            }}>
              {selectedDeviceId === null && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#1c69d4" }} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#1a2129" }}>📍 Phone GPS</Text>
              <Text style={{ fontSize: 12, color: "#6b6b6b", marginTop: 2 }}>Uses your phone's location</Text>
            </View>
          </TouchableOpacity>

          {/* Configured devices */}
          {devices.map((device) => (
            <TouchableOpacity
              key={device.id}
              onPress={() => setSelectedDeviceId(device.id)}
              style={{
                flexDirection: "row", alignItems: "center",
                borderWidth: 1,
                borderColor: selectedDeviceId === device.id ? "#1c69d4" : "#e6e6e6",
                backgroundColor: selectedDeviceId === device.id ? "#e8f0fb" : "#fff",
                padding: 14, marginBottom: 8,
              }}
            >
              <View style={{
                width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                borderColor: selectedDeviceId === device.id ? "#1c69d4" : "#9a9a9a",
                marginRight: 12, alignItems: "center", justifyContent: "center",
              }}>
                {selectedDeviceId === device.id && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#1c69d4" }} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#1a2129" }}>
                  {DEVICE_ICONS[device.type] ?? "📡"} {device.name}
                </Text>
                <Text style={{ fontSize: 12, color: "#6b6b6b", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {device.type}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {devices.length === 0 && (
            <Text style={{ fontSize: 12, color: "#9a9a9a", marginBottom: 8, fontStyle: "italic" }}>
              No satellite devices configured. Add one in Settings.
            </Text>
          )}

          {createError ? (
            <Text className="text-error text-sm font-light mt-2 mb-2">{createError}</Text>
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
              <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Start Trip</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function TripCard({ trip, devices, onUpdateStatus, onDelete }: {
  trip: Trip;
  devices: Device[];
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const statusColor = STATUS_COLORS[trip.status] ?? "#9a9a9a";
  const linkedDevice = devices.find((d) => d.id === trip.device_id);

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text className="text-muted font-light text-xs">
                {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
              {linkedDevice && (
                <Text style={{ fontSize: 10, color: "#6b6b6b" }}>
                  · {DEVICE_ICONS[linkedDevice.type] ?? "📡"} {linkedDevice.name}
                </Text>
              )}
            </View>
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
          <ActionButton label="Share" onPress={() => setShowShare(true)} />
          <ActionButton label="Delete" onPress={() => onDelete(trip.id)} danger />
        </View>
      )}

      <ShareSheet
        trip={trip}
        visible={showShare}
        onClose={() => setShowShare(false)}
      />
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
