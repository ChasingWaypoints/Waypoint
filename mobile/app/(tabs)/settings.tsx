import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";

function SettingsRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between px-4 py-4 bg-canvas border-b border-hairline"
      onPress={onPress}
    >
      <Text className={`font-light text-base ${danger ? "text-error" : "text-ink"}`}>{label}</Text>
      <Text className="text-muted text-lg">›</Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account, all trips, and track data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Forever", style: "destructive",
          onPress: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`${WEB_BASE}/api/account/delete`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
              await supabase.auth.signOut();
            } else {
              const json = await res.json().catch(() => ({}));
              Alert.alert("Error", json.error ?? "Could not delete account. Try again later.");
            }
          },
        },
      ]
    );
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
          <SettingsRow label="Privacy Zones" onPress={() => router.push("/settings/privacy-zones")} />
          <SettingsRow label="Export My Data" onPress={() => {}} />
        </View>

        {/* Account section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Account</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Account Details" onPress={() => {}} />
          <SettingsRow label="Delete Account" onPress={handleDeleteAccount} danger />
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
