import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

function SettingsRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between px-4 py-4 bg-canvas border-b border-hairline"
      onPress={onPress}
    >
      <Text className="text-ink font-light text-base">{label}</Text>
      <Text className="text-muted text-lg">›</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView className="flex-1 bg-surface-soft">
      <View className="pt-6 pb-10">

        {/* Devices section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Devices</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Manage Devices" onPress={() => router.push("/settings/devices")} />
          <SettingsRow label="Add New Device" onPress={() => router.push("/settings/add-device")} />
        </View>

        {/* Privacy section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Privacy</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Privacy Zones" onPress={() => {}} />
          <SettingsRow label="Export My Data" onPress={() => {}} />
        </View>

        {/* Account section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Account</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Account Details" onPress={() => {}} />
          <SettingsRow label="Delete Account" onPress={() => {}} />
        </View>

        {/* Sign out */}
        <View className="px-6 mt-8">
          <TouchableOpacity
            className="border border-error py-4 items-center"
            style={{ borderRadius: 0 }}
            onPress={handleSignOut}
          >
            <Text className="text-error font-bold text-sm tracking-wider uppercase">Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy notice */}
        <Text className="text-muted-soft text-xs font-light text-center px-6 mt-6">
          We never sell your location data. Ever.
        </Text>

      </View>
    </ScrollView>
  );
}
