import { View, Text, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../../lib/supabase";

export default function SettingsScreen() {
  async function handleSignOut() {
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  return (
    <View className="flex-1 bg-slate-900 px-6 pt-6">
      <Text className="text-white text-lg font-bold mb-6">Settings</Text>

      <TouchableOpacity
        className="bg-slate-800 rounded-xl px-4 py-4 flex-row items-center justify-between mb-3"
        onPress={() => {}}
      >
        <Text className="text-white">Devices</Text>
        <Text className="text-slate-400">›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-slate-800 rounded-xl px-4 py-4 flex-row items-center justify-between mb-3"
        onPress={() => {}}
      >
        <Text className="text-white">Privacy Zones</Text>
        <Text className="text-slate-400">›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-slate-800 rounded-xl px-4 py-4 flex-row items-center justify-between mb-3"
        onPress={() => {}}
      >
        <Text className="text-white">Account</Text>
        <Text className="text-slate-400">›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="mt-8 bg-red-500/20 rounded-xl px-4 py-4 items-center"
        onPress={handleSignOut}
      >
        <Text className="text-red-400 font-semibold">Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
