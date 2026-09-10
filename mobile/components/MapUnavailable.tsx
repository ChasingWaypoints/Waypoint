import { View, Text } from "react-native";

/**
 * Stands in for a map when there is no usable Mapbox token. Rendering MapView
 * without one crashes the app natively — an empty screen that explains itself
 * is strictly better than a process death.
 */
export default function MapUnavailable({ note }: { note?: string }) {
  return (
    <View className="flex-1 bg-surface-dark-elevated items-center justify-center px-8">
      <Text className="text-on-dark font-bold text-base mb-2">Map unavailable</Text>
      <Text className="text-on-dark-soft text-sm text-center leading-5">
        {note ??
          "This build has no Mapbox token, so the map can't load. Tracking still works — your position is being recorded and shared as normal."}
      </Text>
    </View>
  );
}
