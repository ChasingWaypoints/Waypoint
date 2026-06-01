import { View, Text, TouchableOpacity } from "react-native";
import { supabase } from "../../lib/supabase";

export default function TripsScreen() {
  return (
    <View className="flex-1 bg-slate-900 items-center justify-center px-6">
      <Text className="text-white text-xl font-bold mb-2">Your Trips</Text>
      <Text className="text-slate-400 text-sm text-center mb-8">
        No trips yet. Add a device and start your first adventure.
      </Text>
      <TouchableOpacity
        className="bg-emerald-500 px-6 py-3 rounded-xl"
        onPress={() => {}}
      >
        <Text className="text-white font-bold">+ Start a Trip</Text>
      </TouchableOpacity>
    </View>
  );
}
