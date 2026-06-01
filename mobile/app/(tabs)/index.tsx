import { View, Text, TouchableOpacity, ScrollView } from "react-native";

export default function TripsScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="px-6 pt-6 pb-10">

        {/* Section label */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-4">Your Trips</Text>

        {/* Empty state */}
        <View className="border border-hairline p-8 items-center">
          <Text className="text-ink text-base font-bold mb-2">No trips yet</Text>
          <Text className="text-muted font-light text-sm text-center mb-6">
            Add a device and start tracking your first adventure.
          </Text>
          <TouchableOpacity
            className="bg-primary px-8 py-3.5 items-center"
            style={{ borderRadius: 0 }}
            onPress={() => {}}
          >
            <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Start a Trip</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
