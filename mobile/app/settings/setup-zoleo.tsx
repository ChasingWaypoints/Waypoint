import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const STEPS = [
  { num: 1, text: "Open the ZOLEO app and sign in." },
  { num: 2, text: "Tap the person icon → Share My Location." },
  { num: 3, text: "Enable sharing and copy your tracking link. It looks like:\nzoleo.com/tracking/AbCdEfGhIjKl" },
  { num: 4, text: "Paste the full link below." },
];

const INTERVALS = [
  { label: "5 min", value: 5, note: "Real-time" },
  { label: "10 min", value: 10, note: "Recommended" },
  { label: "30 min", value: 30, note: "Battery saver" },
];

export default function SetupZoleoScreen() {
  const [deviceName, setDeviceName] = useState("My ZOLEO");
  const [shareUrl, setShareUrl] = useState("");
  const [pollInterval, setPollInterval] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleConnect() {
    setError("");
    let url = shareUrl.trim();
    if (!url) { setError("Please enter your ZOLEO tracking link."); return; }

    // Normalize
    if (!url.startsWith("http")) url = `https://${url}`;

    if (!url.includes("zoleo.com")) {
      setError("That doesn't look like a ZOLEO tracking link. It should contain zoleo.com");
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { error: insertError } = await supabase
      .from("devices")
      .insert({
        user_id: user.id,
        name: deviceName.trim() || "My ZOLEO",
        type: "zoleo",
        feed_url: url,
        is_active: true,
        poll_interval_minutes: pollInterval,
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center px-6">
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔵</Text>
        <Text className="text-ink text-xl font-bold mb-2">ZOLEO Connected</Text>
        <Text className="text-muted font-light text-sm text-center mb-8">
          Your ZOLEO is linked. Waypoint will check your tracking feed on your selected interval whenever a trip is active.
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

        <Text className="text-ink text-xl font-bold mb-1">Connect ZOLEO</Text>
        <Text className="text-muted font-light text-sm mb-8">
          Share your ZOLEO tracking link to enable live location updates.
        </Text>

        {/* Steps */}
        <View className="mb-8">
          {STEPS.map((step) => (
            <View key={step.num} className="flex-row mb-4">
              <View
                className="w-6 h-6 bg-primary items-center justify-center mr-3 mt-0.5"
                style={{ borderRadius: 0, flexShrink: 0 }}
              >
                <Text className="text-on-primary text-xs font-bold">{step.num}</Text>
              </View>
              <Text className="text-body font-light text-sm flex-1 leading-5">{step.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          className="border border-primary py-3 items-center mb-8"
          style={{ borderRadius: 0 }}
          onPress={() => Linking.openURL("https://app.zoleo.com")}
        >
          <Text className="text-primary font-bold text-xs tracking-wider uppercase">Open ZOLEO App ›</Text>
        </TouchableOpacity>

        {/* Note about ZOLEO integration */}
        <View className="bg-surface-soft border border-hairline px-4 py-3 mb-6">
          <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">How It Works</Text>
          <Text className="text-muted font-light text-xs leading-4">
            ZOLEO doesn't have a public polling API yet. Waypoint tracks your location by reading the same feed that powers your ZOLEO sharing link. For best results, keep your ZOLEO share active during your trip.
          </Text>
        </View>

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
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-2">Poll Interval</Text>
            <View className="flex-row gap-2">
              {INTERVALS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setPollInterval(opt.value)}
                  style={{
                    flex: 1, padding: 10, borderWidth: 1, borderRadius: 0, alignItems: "center",
                    backgroundColor: pollInterval === opt.value ? "#1c69d4" : "#fff",
                    borderColor: pollInterval === opt.value ? "#1c69d4" : "#e6e6e6",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: pollInterval === opt.value ? "#fff" : "#262626" }}>
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: "300", color: pollInterval === opt.value ? "#cce0ff" : "#9a9a9a", marginTop: 2 }}>
                    {opt.note}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">ZOLEO Tracking Link</Text>
            <TextInput
              className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
              placeholder="zoleo.com/tracking/AbCdEfGhIjKl"
              placeholderTextColor="#9a9a9a"
              value={shareUrl}
              onChangeText={setShareUrl}
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
