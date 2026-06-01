import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";

const DEVICE_TYPES = [
  {
    type: "garmin",
    icon: "🛰️",
    label: "Garmin inReach",
    description: "Mini 2, Mini, Explorer+, SE+, and all inReach models",
    route: "/settings/setup-garmin",
  },
  {
    type: "spot",
    icon: "📡",
    label: "SPOT Tracker",
    description: "SPOT X, SPOT Gen4, SPOT Trace",
    route: "/settings/setup-spot",
  },
  {
    type: "zoleo",
    icon: "🔵",
    label: "ZOLEO",
    description: "ZOLEO satellite communicator",
    route: "/settings/setup-zoleo",
  },
];

export default function AddDeviceScreen() {
  return (
    <ScrollView className="flex-1 bg-surface-soft">
      <View className="pt-6 pb-10">
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-3">
          Choose Device Type
        </Text>

        <View className="border-t border-hairline">
          {DEVICE_TYPES.map((device) => (
            <TouchableOpacity
              key={device.type}
              className="bg-canvas border-b border-hairline px-6 py-5 flex-row items-center"
              onPress={() => router.push(device.route as never)}
            >
              <Text style={{ fontSize: 28, marginRight: 16 }}>{device.icon}</Text>
              <View className="flex-1">
                <Text className="text-ink font-bold text-base">{device.label}</Text>
                <Text className="text-muted font-light text-xs mt-0.5">{device.description}</Text>
              </View>
              <Text className="text-muted text-lg">›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-muted-soft font-light text-xs text-center px-6 mt-6">
          Phone GPS is always available — no setup required. Start a trip and tap Track.
        </Text>
      </View>
    </ScrollView>
  );
}
