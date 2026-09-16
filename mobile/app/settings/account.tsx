import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";

export default function AccountScreen() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  /**
   * The Waypoint ID is how an organizer links a rider to a roster row, and the
   * app never showed it — so a rider had no way to hand it over. null means we
   * could not read it, which is different from "you don't have one": every
   * profile gets one from a trigger on insert.
   */
  const [waypointId, setWaypointId] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";
      setDisplayName(name);
      setOriginalName(name);
      setMemberSince(new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }));

      const { data: prof } = await supabase
        .from("profiles")
        .select("waypoint_id")
        .eq("id", user.id)
        .maybeSingle();
      setWaypointId((prof?.waypoint_id as string | undefined) ?? null);

      setLoading(false);
    }
    load();
  }, []);

  async function copyWaypointId() {
    if (!waypointId) return;
    await Clipboard.setStringAsync(waypointId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1800);
  }

  async function handleSaveName() {
    if (displayName.trim() === originalName.trim()) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setOriginalName(displayName.trim());
      Alert.alert("Saved", "Display name updated.");
    }
  }

  async function handleResetPassword() {
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setResetSent(true);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-surface-soft items-center justify-center">
        <ActivityIndicator color={theme.action} />
      </View>
    );
  }

  const nameChanged = displayName.trim() !== originalName.trim();

  return (
    <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
      <View className="pt-6 pb-10">

        {/* Profile */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Profile</Text>
        <View className="border-t border-b border-hairline">
          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Display Name</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={theme.muted}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
          </View>
          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Email</Text>
            <Text className="text-ink font-light text-base">{email}</Text>
          </View>
          <View className="bg-canvas px-6 py-4">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Waypoint ID</Text>
            {waypointId ? (
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-primary text-lg font-bold"
                  style={{ letterSpacing: 3, fontFamily: "monospace" }}
                  selectable
                >
                  {waypointId}
                </Text>
                <TouchableOpacity
                  className={`rounded-lg px-4 py-2 ${idCopied ? "bg-primary" : "bg-surface-dark-elevated"}`}
                  onPress={copyWaypointId}
                >
                  <Text className={`text-xs font-bold ${idCopied ? "text-on-primary" : "text-on-dark"}`}>
                    {idCopied ? "Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* A dash tells a rider nothing. Say what it is and what to do. */
              <Text className="text-muted font-light text-sm leading-5">
                Couldn't load your ID. Check it at waypointtracking.com under Profile — give it to an
                organizer and they can add you to an event roster.
              </Text>
            )}
            <Text className="text-muted-soft text-xs mt-2 leading-4">
              Give this to an event organizer to be added to their roster.
            </Text>
          </View>
        </View>

        {nameChanged && (
          <View className="px-6 mt-3">
            <TouchableOpacity
              className="bg-primary py-4 items-center"
              style={{ borderRadius: 0 }}
              onPress={handleSaveName}
              disabled={saving}
            >
              <Text className="text-on-primary font-bold text-sm tracking-wider uppercase">
                {saving ? "Saving…" : "Save Name"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Security */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mt-6 mb-2">Security</Text>
        <View className="border-t border-b border-hairline">
          {resetSent ? (
            <View className="bg-canvas px-6 py-4">
              <Text className="text-ink font-bold text-sm mb-1">Email sent</Text>
              <Text className="text-muted font-light text-xs">
                Check {email} for a password reset link.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              className="flex-row items-center justify-between px-6 py-4 bg-canvas"
              onPress={handleResetPassword}
            >
              <Text className="text-ink font-light text-base">Change Password</Text>
              <Text className="text-muted text-lg">›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Member info */}
        <Text className="text-muted-soft text-xs font-light text-center px-6 mt-8">
          Member since {memberSince}
        </Text>

      </View>
    </ScrollView>
  );
}
