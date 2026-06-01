import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  last_polled_at: string | null;
  poll_error: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  garmin: "Garmin inReach",
  spot: "SPOT Tracker",
  zoleo: "ZOLEO",
  phone: "Phone GPS",
};

const TYPE_ICONS: Record<string, string> = {
  garmin: "🛰️",
  spot: "📡",
  zoleo: "🔵",
  phone: "📱",
};

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    const { data } = await supabase
      .from("devices")
      .select("id, name, type, is_active, last_polled_at, poll_error")
      .order("created_at", { ascending: false });
    if (data) setDevices(data);
    setLoading(false);
  }

  async function removeDevice(id: string) {
    await supabase.from("devices").update({ is_active: false }).eq("id", id);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <ScrollView className="flex-1 bg-surface-soft">
      <View className="pt-6 pb-10">

        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-3">
          Connected Devices
        </Text>

        {loading ? (
          <ActivityIndicator color="#1c69d4" style={{ marginTop: 20 }} />
        ) : devices.length === 0 ? (
          <View className="mx-6 border border-hairline bg-canvas p-6 items-center">
            <Text className="text-ink font-bold text-sm mb-1">No devices connected</Text>
            <Text className="text-muted font-light text-xs text-center">
              Add a satellite device or use your phone GPS to start tracking.
            </Text>
          </View>
        ) : (
          <View className="border-t border-hairline">
            {devices.map((device) => (
              <View key={device.id} className="bg-canvas border-b border-hairline px-6 py-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Text style={{ fontSize: 22 }}>{TYPE_ICONS[device.type] ?? "📡"}</Text>
                    <View className="flex-1">
                      <Text className="text-ink font-bold text-sm">{device.name}</Text>
                      <Text className="text-muted font-light text-xs mt-0.5">
                        {TYPE_LABELS[device.type] ?? device.type}
                      </Text>
                      {device.last_polled_at && (
                        <Text className="text-muted-soft font-light text-xs mt-0.5">
                          Last polled: {new Date(device.last_polled_at).toLocaleTimeString()}
                        </Text>
                      )}
                      {device.poll_error && (
                        <Text className="text-error text-xs font-light mt-0.5">
                          ⚠ {device.poll_error}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeDevice(device.id)}
                    className="border border-hairline-strong px-3 py-1.5"
                    style={{ borderRadius: 0 }}
                  >
                    <Text className="text-muted text-xs font-bold uppercase tracking-wider">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className="px-6 mt-6">
          <TouchableOpacity
            className="bg-primary py-4 items-center"
            style={{ borderRadius: 0 }}
            onPress={() => router.push("/settings/add-device")}
          >
            <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">+ Add Device</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
