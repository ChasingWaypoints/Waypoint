import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Share, Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, router } from "expo-router";
import { supabase } from "../../lib/supabase";

const WEB_BASE = "https://app.chasingwaypoints.com";

const EXPIRY_OPTIONS = [
  { label: "Never",   hours: null },
  { label: "24 h",   hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
] as const;

interface TripDetail {
  id: string;
  name: string;
  description: string | null;
  status: "planning" | "active" | "completed" | "archived";
  is_public: boolean;
  share_token: string | null;
  share_expires_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  device_id: string | null;
  point_count: number;
}

export default function TripEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [trip, setTrip]           = useState<TripDetail | null>(null);
  const [name, setName]           = useState("");
  const [description, setDesc]    = useState("");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [ending, setEnding]       = useState(false);

  // Sharing state
  const [isPublic, setIsPublic]         = useState(false);
  const [shareToken, setShareToken]     = useState<string | null>(null);
  const [expiryHours, setExpiryHours]   = useState<number | null>(null);
  const [enablingShare, setEnablingShare] = useState(false);
  const [copied, setCopied]             = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get trip + point count in parallel
    const [tripRes, countRes] = await Promise.all([
      supabase
        .from("trips")
        .select("id, name, description, status, is_public, share_token, share_expires_at, started_at, ended_at, created_at, device_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("track_points")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", id),
    ]);

    if (tripRes.data) {
      const t = { ...tripRes.data, point_count: countRes.count ?? 0 } as TripDetail;
      setTrip(t);
      setName(t.name);
      setDesc(t.description ?? "");
      setIsPublic(t.is_public);
      setShareToken(t.share_token);
      navigation.setOptions({ title: t.name });
    }
    setLoading(false);
  }

  async function save() {
    if (!trip || !name.trim()) return;
    setSaving(true);
    await supabase
      .from("trips")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", id);
    navigation.setOptions({ title: name.trim() });
    setSaving(false);
  }

  async function endTrip() {
    Alert.alert("End Trip", "Mark this trip as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Trip", style: "destructive",
        onPress: async () => {
          setEnding(true);
          await supabase
            .from("trips")
            .update({ status: "completed", ended_at: new Date().toISOString() })
            .eq("id", id);
          setTrip((t) => t ? { ...t, status: "completed", ended_at: new Date().toISOString() } : t);
          setEnding(false);
        },
      },
    ]);
  }

  async function enableSharing() {
    if (!trip) return;
    setEnablingShare(true);
    const { nanoid } = await import("nanoid/non-secure");
    const token = shareToken ?? nanoid(12);
    const expiresAt = expiryHours
      ? new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()
      : null;
    await supabase
      .from("trips")
      .update({ is_public: true, share_token: token, share_expires_at: expiresAt })
      .eq("id", id);
    setShareToken(token);
    setIsPublic(true);
    setEnablingShare(false);
  }

  async function disableSharing() {
    await supabase.from("trips").update({ is_public: false }).eq("id", id);
    setIsPublic(false);
  }

  async function nativeShare() {
    if (!shareToken) return;
    const url = `${WEB_BASE}/share/${shareToken}`;
    await Share.share({ message: `Follow my trip "${name}" live: ${url}`, url });
  }

  function copyLink() {
    if (!shareToken) return;
    const url = `${WEB_BASE}/share/${shareToken}`;
    if (Platform.OS === "web") navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const shareUrl = shareToken ? `${WEB_BASE}/share/${shareToken}` : null;
  const kmlUrl   = shareToken ? `${WEB_BASE}/api/trips/${id}/track.kml?token=${shareToken}` : null;
  const gpxUrl   = shareToken ? `${WEB_BASE}/api/trips/${id}/track.gpx?token=${shareToken}` : null;

  function duration(): string {
    if (!trip?.started_at) return "—";
    const end = trip.ended_at ? new Date(trip.ended_at) : new Date();
    const mins = Math.round((end.getTime() - new Date(trip.started_at).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h ${m}m`;
  }

  if (loading) return (
    <View className="flex-1 bg-surface-soft items-center justify-center">
      <ActivityIndicator color="#3E5F44" />
    </View>
  );
  if (!trip) return (
    <View className="flex-1 bg-surface-soft items-center justify-center">
      <Text className="text-muted">Trip not found</Text>
    </View>
  );

  const isActive = trip.status === "active";

  return (
    <ScrollView className="flex-1 bg-surface-soft" keyboardShouldPersistTaps="handled">
      <View className="pt-6 pb-16">

        {/* ── END TRIP banner ─────────────────────────────────────────────── */}
        {isActive && (
          <View className="mx-6 mb-6 bg-surface-dark p-4">
            <View className="flex-row items-center gap-2 mb-3">
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />
              <Text className="text-on-dark font-bold text-sm">Trip is active — tracking live</Text>
            </View>
            <TouchableOpacity
              onPress={endTrip}
              disabled={ending}
              style={{
                backgroundColor: "#dc2626", paddingVertical: 14,
                alignItems: "center", opacity: ending ? 0.6 : 1,
              }}
            >
              {ending
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>End Trip</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Edit name & notes ────────────────────────────────────────────── */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Details</Text>
        <View className="border-t border-b border-hairline mb-6">

          <View className="bg-canvas px-6 py-4 border-b border-hairline">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Trip Name</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={name}
              onChangeText={setName}
              onBlur={save}
              placeholder="e.g. Sacramento to Tahoe"
              placeholderTextColor="#9a9a9a"
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>

          <View className="bg-canvas px-6 py-4">
            <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-1">Notes (optional)</Text>
            <TextInput
              className="text-ink font-light text-base py-1"
              value={description}
              onChangeText={setDesc}
              onBlur={save}
              placeholder="Route notes, conditions, highlights…"
              placeholderTextColor="#9a9a9a"
              multiline
              numberOfLines={3}
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Save button */}
        <View className="px-6 mb-8">
          <TouchableOpacity
            onPress={save}
            disabled={saving}
            className="bg-surface-dark py-4 items-center"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-on-dark font-bold text-sm tracking-wider uppercase">Save Changes</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Stats</Text>
        <View className="border-t border-b border-hairline mb-8">
          {[
            ["Points recorded", String(trip.point_count)],
            ["Duration",        duration()],
            ["Started",         trip.started_at ? new Date(trip.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"],
            ["Status",          trip.status.toUpperCase()],
          ].map(([label, value]) => (
            <View key={label} className="bg-canvas border-b border-hairline px-6 py-3 flex-row justify-between">
              <Text className="text-muted font-light text-sm">{label}</Text>
              <Text className="text-ink font-bold text-sm">{value}</Text>
            </View>
          ))}
        </View>

        {/* ── Sharing ─────────────────────────────────────────────────────── */}
        <Text className="text-muted text-xs font-bold uppercase tracking-widest px-6 mb-2">Share</Text>
        <View className="border-t border-b border-hairline mb-6">

          {!isPublic ? (
            <View className="bg-canvas px-6 py-5">
              <Text className="text-ink font-light text-sm mb-4 leading-relaxed">
                Sharing is off. Enable it to get a public link anyone can open to follow your trip on a live map.
              </Text>

              {/* Expiry picker */}
              <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-2">Link Expires</Text>
              <View className="flex-row gap-2 mb-5">
                {EXPIRY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={String(opt.hours)}
                    onPress={() => setExpiryHours(opt.hours ?? null)}
                    className="flex-1 py-2.5 items-center border border-hairline"
                    style={{ borderColor: expiryHours === (opt.hours ?? null) ? "#FAA634" : "#e6e6e6", backgroundColor: expiryHours === (opt.hours ?? null) ? "#FFF7EC" : "#fff" }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: expiryHours === (opt.hours ?? null) ? "#FAA634" : "#6b6b6b" }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={enableSharing}
                disabled={enablingShare}
                className="bg-primary py-4 items-center"
                style={{ opacity: enablingShare ? 0.6 : 1 }}
              >
                {enablingShare
                  ? <ActivityIndicator color="#fff" />
                  : <Text className="text-on-primary font-bold text-xs tracking-widest uppercase">Enable Sharing</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View className="bg-canvas px-6 py-5">

              {/* Share URL row */}
              <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-2">Live Map Link</Text>
              <View className="flex-row border border-hairline mb-4">
                <Text className="flex-1 px-3 py-3 text-ink font-light text-xs" numberOfLines={1}>{shareUrl}</Text>
                <TouchableOpacity
                  onPress={copyLink}
                  style={{ backgroundColor: copied ? "#22c55e" : "#FAA634", paddingHorizontal: 14, justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
                    {copied ? "COPIED" : "COPY"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Native share */}
              {Platform.OS !== "web" && (
                <TouchableOpacity
                  onPress={nativeShare}
                  className="border border-hairline py-3.5 items-center mb-4"
                  style={{ borderColor: "#3E5F44" }}
                >
                  <Text style={{ color: "#3E5F44", fontWeight: "700", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    Share via…
                  </Text>
                </TouchableOpacity>
              )}

              {/* KML / GPX */}
              <Text className="text-muted text-xs font-bold uppercase tracking-widest mb-2 mt-1">Export</Text>
              <View className="flex-row gap-2 mb-5">
                <TouchableOpacity
                  className="flex-1 border border-hairline py-3 items-center"
                  onPress={() => Platform.OS === "web" && kmlUrl && (window as any).open(kmlUrl, "_blank")}
                >
                  <Text className="text-ink font-bold text-xs tracking-widest">KML</Text>
                  <Text className="text-muted font-light text-xs mt-0.5">Google Earth</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 border border-hairline py-3 items-center"
                  onPress={() => Platform.OS === "web" && gpxUrl && (window as any).open(gpxUrl, "_blank")}
                >
                  <Text className="text-ink font-bold text-xs tracking-widest">GPX</Text>
                  <Text className="text-muted font-light text-xs mt-0.5">Garmin / Gaia</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={disableSharing}
                className="border border-hairline py-3.5 items-center"
                style={{ borderColor: "#fecaca" }}
              >
                <Text style={{ color: "#dc2626", fontWeight: "700", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  Disable Sharing
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </View>
    </ScrollView>
  );
}
