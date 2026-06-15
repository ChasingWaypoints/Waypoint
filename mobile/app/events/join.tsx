import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";

export default function JoinEventScreen() {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { Alert.alert("Enter the join code from your organizer"); return; }
    setJoining(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert("Not signed in"); setJoining(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ code: trimmed, display_name: displayName.trim() }),
    });

    const json = await res.json();
    setJoining(false);

    if (!res.ok) {
      Alert.alert("Error", json.error ?? "Could not join event");
      return;
    }

    router.replace(`/events/${json.event_id}`);
  }

  return (
    <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
      <View className="pt-6 pb-10">

        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Join Event</Text>
        <View className="border-t border-b border-hairline">
          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Join Code *</Text>
            <TextInput
              className="text-ink font-bold text-2xl py-1 tracking-widest"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="RIDE42"
              placeholderTextColor="#9a9a9a"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              returnKeyType="next"
              autoFocus
            />
          </View>
          <View className="bg-canvas px-6 py-4">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Your Display Name (optional)</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How you'll appear on the group map"
              placeholderTextColor="#9a9a9a"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
          </View>
        </View>

        <Text className="text-muted-soft font-light text-xs px-6 mt-3">
          Get the code from your event organizer. Your position will appear on the group map when you start a trip.
        </Text>

        <View className="px-6 mt-6">
          <TouchableOpacity
            className="bg-primary py-4 items-center"
            style={{ borderRadius: 0, opacity: joining ? 0.6 : 1 }}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Join Event</Text>
            }
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
