import { View, Text, TouchableOpacity, ScrollView, Alert, Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import Constants from "expo-constants";
import { clearEntitlements } from "../../lib/entitlements";

// The canonical domain, not the Vercel preview URL this used to point at.
// Account deletion runs through here and reviewers do exercise it.
const WEB_BASE = "https://waypointtracking.com";

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
    // Otherwise the next account inherits this one's cached plan.
    clearEntitlements();
    await supabase.auth.signOut();
  }

  /**
   * Deleting an organizer's account is not the same act as deleting a rider's.
   *
   * events.organizer_id cascades, so every event they created goes with the
   * account — and with each event goes every rider's roster entry and event
   * track points. Riders who were never asked lose their ride record. The old
   * dialog said "your account, all trips, and track data", which is true for a
   * rider and badly incomplete for an organizer.
   *
   * So: ask the server what this specific account owns, and say it. An
   * organizer confirms twice; a rider still confirms once.
   */
  async function handleDeleteAccount() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: impact } = await supabase.rpc("account_deletion_impact");

    const doDelete = async () => {
      const res = await fetch(`${WEB_BASE}/api/account/delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        clearEntitlements();
        await supabase.auth.signOut();
      } else {
        const json = await res.json().catch(() => ({}));
        Alert.alert("Error", json.error ?? "Could not delete account. Try again later.");
      }
    };

    if (!impact?.is_organizer) {
      Alert.alert(
        "Delete Account",
        "This permanently deletes your account, all trips, and track data. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete Forever", style: "destructive", onPress: doDelete },
        ]
      );
      return;
    }

    const ev = impact.events as number;
    const live = impact.events_not_ended as number;
    const riders = impact.riders_affected as number;
    const s1 = ev === 1 ? "" : "s";
    const rPoss = riders === 1 ? "'s" : "s'";

    const lines = [
      `You organize ${ev} event${s1}.`,
      "",
      "Deleting your account also deletes:",
      `  \u2022 All ${ev} of your event${s1}${live > 0 ? ` \u2014 ${live} not finished yet` : ""}`,
      riders > 0
        ? `  \u2022 ${riders} rider${rPoss} roster entries and tracks in those events`
        : "  \u2022 Their rosters and tracking data",
      "  \u2022 Your own trips and track data",
      "",
      riders > 0
        ? "Those riders lose their record of those rides, and they are not being asked."
        : "This cannot be undone.",
    ].join("\n");

    Alert.alert("Delete Account \u2014 read this first", lines, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Last chance",
            `Permanently delete your account, ${ev} event${s1}` +
              (riders > 0 ? ` and ${riders} rider${rPoss} data` : "") +
              "? This cannot be undone.",
            [
              { text: "Keep My Account", style: "cancel" },
              { text: "Delete Everything", style: "destructive", onPress: doDelete },
            ]
          ),
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-surface-soft">
      <View className="pt-6 pb-10">

        {/* Devices section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Devices</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Ride History" onPress={() => router.push("/history")} />
          <SettingsRow label="Manage Devices" onPress={() => router.push("/settings/devices")} />
          <SettingsRow label="Add New Device" onPress={() => router.push("/settings/add-device")} />
        </View>

        {/* Privacy section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Privacy</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Privacy Zones" onPress={() => router.push("/settings/privacy-zones")} />
          <SettingsRow
            label="Export Rides (GPX / KML)"
            onPress={() => Linking.openURL(`${WEB_BASE}/dashboard`)}
          />
        </View>

        {/* Legal — Play requires the privacy policy be reachable inside the app,
            not only on the store listing, for any app using background
            location. It was reachable in neither place from here. */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Legal</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Privacy Policy" onPress={() => Linking.openURL(`${WEB_BASE}/privacy`)} />
          <SettingsRow label="Terms & Conditions" onPress={() => Linking.openURL(`${WEB_BASE}/terms`)} />
        </View>

        {/* Account section */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Account</Text>
        <View className="border-t border-hairline">
          <SettingsRow label="Account Details" onPress={() => router.push("/settings/account")} />
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

        {/* Build identity — so a tester can say which APK they are on */}
        <Text className="text-muted-soft text-xs font-light text-center px-6 mt-8">
          Waypoint {Constants.expoConfig?.version ?? "?"}
          {Constants.expoConfig?.android?.versionCode
            ? ` (${Constants.expoConfig.android.versionCode})`
            : ""}
          {" · "}
          {String((Constants.expoConfig?.extra as { commit?: string } | undefined)?.commit ?? "local")}
        </Text>

        {/* Privacy notice */}
        <Text className="text-muted-soft text-xs font-light text-center px-6 mt-6">
          We never sell your location data. Ever.
        </Text>

      </View>
    </ScrollView>
  );
}
