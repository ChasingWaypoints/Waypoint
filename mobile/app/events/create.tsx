import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";

export default function CreateEventScreen() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { Alert.alert("Name required"); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert("Not signed in"); setSaving(false); return; }

    const res = await fetch(`${WEB_BASE}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      Alert.alert("Error", json.error ?? "Could not create event");
      return;
    }

    // Navigate to the event detail screen
    router.replace(`/events/${json.id}`);
  }

  return (
    <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
      <View className="pt-6 pb-10">

        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Event Details</Text>
        <View className="border-t border-b border-hairline">
          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Event Name *</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={name}
              onChangeText={setName}
              placeholder="e.g. IBA SS1000 June 2026"
              placeholderTextColor="#9a9a9a"
              returnKeyType="next"
              autoFocus
            />
          </View>
          <View className="bg-canvas px-6 py-4">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Description (optional)</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={description}
              onChangeText={setDescription}
              placeholder="Route notes, start location, etc."
              placeholderTextColor="#9a9a9a"
              multiline
              numberOfLines={3}
              returnKeyType="done"
            />
          </View>
        </View>

        <Text className="text-muted-soft font-light text-xs px-6 mt-3">
          Once created, you'll get a join code to share with your riders and a Google Earth Pro link for live tracking.
        </Text>

        <View className="px-6 mt-6">
          <TouchableOpacity
            className="bg-primary py-4 items-center"
            style={{ borderRadius: 0, opacity: saving ? 0.6 : 1 }}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">Create Event</Text>
            }
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
