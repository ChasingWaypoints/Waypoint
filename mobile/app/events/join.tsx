import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://app.chasingwaypoints.com";

interface EventLookup {
  id: string;
  name: string;
  status: string;
  rider_classes: string[];
}

export default function JoinEventScreen() {
  // Step 1 — enter code
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);

  // Step 2 — fill in details
  const [eventInfo, setEventInfo] = useState<EventLookup | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [riderClass, setRiderClass] = useState<string | null>(null);
  const [riderNumber, setRiderNumber] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleLookup() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { Alert.alert("Enter the join code from your organizer"); return; }
    setLooking(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert("Not signed in"); setLooking(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events/join?code=${encodeURIComponent(trimmed)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const json = await res.json();
    setLooking(false);

    if (!res.ok) {
      Alert.alert("Error", json.error ?? "Event not found");
      return;
    }

    setRiderClass(null);
    setEventInfo(json as EventLookup);
  }

  async function handleJoin() {
    if (!eventInfo) return;
    setJoining(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert("Not signed in"); setJoining(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        display_name: displayName.trim() || undefined,
        rider_class: riderClass || undefined,
        rider_number: riderNumber.trim() || undefined,
      }),
    });

    const json = await res.json();
    setJoining(false);

    if (!res.ok) {
      Alert.alert("Error", json.error ?? "Could not join event");
      return;
    }

    router.replace(`/events/${json.event_id}`);
  }

  // ── Step 1: Enter code ─────────────────────────────────────────
  if (!eventInfo) {
    return (
      <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
        <View className="pt-6 pb-10">
          <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Join Event</Text>
          <View className="border-t border-b border-hairline">
            <View className="bg-canvas px-6 py-4">
              <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Join Code</Text>
              <TextInput
                className="text-ink font-bold text-3xl py-2 tracking-widest"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="RIDE42"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={handleLookup}
                autoFocus
              />
            </View>
          </View>

          <Text className="text-muted-soft font-light text-xs px-6 mt-3">
            Get the 6-character code from your event organizer.
          </Text>

          <View className="px-6 mt-6">
            <TouchableOpacity
              className="bg-primary py-4 items-center"
              style={{ borderRadius: 0, opacity: looking ? 0.6 : 1 }}
              onPress={handleLookup}
              disabled={looking || code.trim().length < 4}
            >
              {looking
                ? <ActivityIndicator color="#fff" />
                : <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Find Event →</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Step 2: Fill in details ────────────────────────────────────
  const hasClasses = eventInfo.rider_classes.length > 0;

  return (
    <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
      <View className="pt-6 pb-10">

        {/* Event name banner */}
        <View className="bg-primary px-6 py-4 mb-1">
          <Text className="text-on-primary text-xs font-bold uppercase tracking-widest mb-0.5 opacity-70">Joining</Text>
          <Text className="text-on-primary text-xl font-bold">{eventInfo.name}</Text>
        </View>

        <View className="border-t border-b border-hairline">

          {/* Display name */}
          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Your Name (optional)</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How you'll appear on the group map"
              placeholderTextColor="#9a9a9a"
              returnKeyType="next"
            />
          </View>

          {/* Class picker — only shown if event has classes defined */}
          {hasClasses && (
            <View className="bg-canvas px-6 py-4 border-b border-hairline">
              <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-3">Class</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {eventInfo.rider_classes.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setRiderClass(riderClass === c ? null : c)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderWidth: 1.5,
                      borderColor: riderClass === c ? "#1c69d4" : "#d4d4d4",
                      backgroundColor: riderClass === c ? "#1c69d4" : "#fff",
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: riderClass === c ? "#fff" : "#1a2129",
                      letterSpacing: 0.3,
                    }}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Rider / car number */}
          <View className="bg-canvas px-6 py-4">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">
              {hasClasses ? "Rider / Car Number (optional)" : "Number (optional)"}
            </Text>
            <TextInput
              className="text-ink font-bold text-xl py-1 tracking-wider"
              value={riderNumber}
              onChangeText={setRiderNumber}
              placeholder="e.g. 42"
              placeholderTextColor="#9a9a9a"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
          </View>
        </View>

        <Text className="text-muted-soft font-light text-xs px-6 mt-3">
          Your position will appear on the group map when you start a trip.
        </Text>

        <View className="px-6 mt-6" style={{ gap: 10 }}>
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

          {/* Back to code entry */}
          <TouchableOpacity
            onPress={() => setEventInfo(null)}
            style={{ paddingVertical: 12, alignItems: "center" }}
          >
            <Text className="text-muted text-xs font-bold uppercase tracking-widest">← Different Code</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
