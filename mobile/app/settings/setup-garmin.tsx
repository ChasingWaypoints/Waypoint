import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const STEPS = [
  { num: 1, text: 'Open the Garmin Explore website or app and sign in.' },
  { num: 2, text: 'Go to your device → MapShare → Enable MapShare.' },
  { num: 3, text: 'Copy your MapShare link — it looks like:\nshare.garmin.com/p/AbCdEfGh' },
  { num: 4, text: 'Paste it below. Waypoint will validate and connect automatically.' },
];

export default function SetupGarminScreen() {
  const [deviceName, setDeviceName] = useState("My Garmin inReach");
  const [feedUrl, setFeedUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleConnect() {
    setError("");
    if (!feedUrl.trim()) { setError("Please enter your MapShare URL."); return; }

    // Normalize URL
    let url = feedUrl.trim();
    if (!url.startsWith("http")) url = `https://${url}`;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Call our API to validate + save
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL?.replace("supabase.co", "vercel.app") ?? ""}/api/devices`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deviceName, type: "garmin", feed_url: url }),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not connect to Garmin feed. Check your MapShare URL.");
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center px-6">
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🛰️</Text>
        <Text className="text-ink text-xl font-bold mb-2">Device Connected</Text>
        <Text className="text-muted font-light text-sm text-center mb-8">
          Your Garmin inReach is linked. Waypoint will poll your location every 10 minutes when a trip is active.
        </Text>
        <TouchableOpacity
          className="bg-primary px-8 py-4 w-full items-center"
          style={{ borderRadius: 0 }}
          onPress={() => router.replace("/settings/devices")}
        >
          <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">View Devices</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" keyboardShouldPersistTaps="handled">
      <View className="px-6 pt-6 pb-10">

        <Text className="text-ink text-xl font-bold mb-1">Connect Garmin inReach</Text>
        <Text className="text-muted font-light text-sm mb-8">
          Follow these steps to find your MapShare link.
        </Text>

        {/* Steps */}
        <View className="mb-8">
          {STEPS.map((step) => (
            <View key={step.num} className="flex-row mb-4">
              <View className="w-6 h-6 bg-primary items-center justify-center mr-3 mt-0.5" style={{ borderRadius: 0, flexShrink: 0 }}>
                <Text className="text-on-primary text-xs font-bold">{step.num}</Text>
              </View>
              <Text className="text-body font-light text-sm flex-1 leading-5">{step.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          className="border border-primary py-3 items-center mb-8"
          style={{ borderRadius: 0 }}
          onPress={() => Linking.openURL("https://explore.garmin.com")}
        >
          <Text className="text-primary font-bold text-xs tracking-wider uppercase">Open Garmin Explore ›</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View className="border-t border-hairline mb-6" />

        {/* Form */}
        <View className="gap-3">
          <View>
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">Device Name</Text>
            <TextInput
              className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
              value={deviceName}
              onChangeText={setDeviceName}
              style={{ borderRadius: 0 }}
            />
          </View>

          <View>
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">MapShare URL</Text>
            <TextInput
              className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
              placeholder="share.garmin.com/p/AbCdEfGh"
              placeholderTextColor="#9a9a9a"
              value={feedUrl}
              onChangeText={setFeedUrl}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ borderRadius: 0 }}
            />
          </View>

          {error ? (
            <Text className="text-error text-sm font-light">{error}</Text>
          ) : null}

          <TouchableOpacity
            className="bg-primary py-4 items-center mt-2"
            style={{ borderRadius: 0 }}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Validate & Connect</Text>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
