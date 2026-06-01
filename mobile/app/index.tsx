import { View, Text } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-900">
      <Text className="text-white text-2xl font-bold">🗺️ Waypoint</Text>
      <Text className="text-emerald-400 text-sm mt-2">Adventure starts here</Text>
    </View>
  );
}
