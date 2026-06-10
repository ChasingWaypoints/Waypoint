import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const STEPS = [
  { num: 1, text: "Sign in at findmespot.com and go to My Account." },
  { num: 2, text: "Select your device, then open the Shared Page tab." },
  { num: 3, text: "Enable the shared page. Your Feed ID appears in the page URL:\nsharepoint.findmespot.com/shared/?type=0&deviceId=XXXXXXXX" },
  { num: 4, text: "Copy that ID and paste it below." },
];

const INTERVALS = [
  { label: "5 min", value: 5, note: "Standard" },
  { label: "10 min", value: 10, note: "Recommended" },
  { label: "30 min", value: 30, note: "Battery saver" },
];

export default function SetupSpotScreen() {
  const [deviceName, setDeviceName] = useState("My SPOT Tracker");
  const [feedId, setFeedId] = useState("");
  const [feedPassword, setFeedPassword] = useState("");
  const [pollInterval, setPollInterval] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleConnect() {
    setError("");
    const id = feedId.trim();
    if (!id) { setError("Please enter your SPOT Feed ID."); return; }
    if (id.length < 6) { setError("Feed ID looks too short — double-check it in your SPOT account."); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Build the SPOT API feed URL (XML endpoint — matches the server-side parser)
    const feedUrl = `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/${id}/message.xml${feedPassword ? `?feedPassword=${encodeURIComponent(feedPassword)}` : ""}`;

    const { error: insertError } = await supabase
      .from("devices")
      .insert({
        user_id: user.id,
        name: deviceName.trim() || "My SPOT Tracker",
        type: "spot",
        feed_url: feedUrl,
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
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📡</Text>
        <Text className="text-ink text-xl font-bold mb-2">SPOT Connected</Text>
        <Text className="text-muted font-light text-sm text-center mb-8">
          Your SPOT Tracker is linked. Waypoint will check for new location pings on your selected interval whenever a trip is active.
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

        <Text className="text-ink text-xl font-bold mb-1">Connect SPOT Tracker</Text>
        <Text className="text-muted font-light text-sm mb-8">
          Find your Feed ID in your SPOT account to enable location polling.
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
          onPress={() => Linking.openURL("https://www.findmespot.com/en-us/account")}
        >
          <Text className="text-primary font-bold text-xs tracking-wider uppercase">Open SPOT Account ›</Text>
        </TouchableOpacity>

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
            <Text className="text-muted-soft text-xs font-light mt-2">
              SPOT updates every 2.5–5 min on Standard plan. Polling more frequently won't yield new data.
            </Text>
          </View>

          <View>
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">SPOT Feed ID</Text>
            <TextInput
              className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
              placeholder="e.g. 0ZrtAbCdEfGhIjKl"
              placeholderTextColor="#9a9a9a"
              value={feedId}
              onChangeText={setFeedId}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ borderRadius: 0 }}
            />
          </View>

          <View>
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1.5">
              Feed Password <Text className="text-muted-soft font-light normal-case tracking-normal">(optional)</Text>
            </Text>
            <TextInput
              className="bg-canvas text-ink border border-hairline px-4 py-3.5 text-base font-light"
              placeholder="Only if you set one in SPOT"
              placeholderTextColor="#9a9a9a"
              value={feedPassword}
              onChangeText={setFeedPassword}
              secureTextEntry
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
