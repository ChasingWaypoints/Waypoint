import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Share, Platform, TextInput } from "react-native";
import { supabase } from "../lib/supabase";

const WEB_BASE = "https://waypoint-web-two.vercel.app";

const EXPIRY_OPTIONS = [
  { label: "Never", hours: null },
  { label: "24h", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
] as const;

interface ShareSheetProps {
  trip: { id: string; name: string; share_token: string | null; is_public: boolean };
  visible: boolean;
  onClose: () => void;
}

export default function ShareSheet({ trip, visible, onClose }: ShareSheetProps) {
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState(trip.share_token);
  const [isPublic, setIsPublic] = useState(trip.is_public);
  const [expiryHours, setExpiryHours] = useState<number | null>(null);
  const [sharePassword, setSharePassword] = useState("");

  const shareUrl = shareToken ? `${WEB_BASE}/share/${shareToken}` : null;
  const kmlUrl = shareToken ? `${WEB_BASE}/api/trips/${trip.id}/track.kml?token=${shareToken}` : null;
  const gpxUrl = shareToken ? `${WEB_BASE}/api/trips/${trip.id}/track.gpx?token=${shareToken}` : null;

  async function enableSharing() {
    setMaking(true);
    const { nanoid } = await import("nanoid/non-secure");
    const token = nanoid(12);
    const expiresAt = expiryHours
      ? new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()
      : null;
    const { error } = await supabase
      .from("trips")
      .update({
        is_public: true,
        share_token: token,
        share_expires_at: expiresAt,
        share_password_hash: sharePassword.trim() || null,
      })
      .eq("id", trip.id);
    if (!error) {
      setShareToken(token);
      setIsPublic(true);
    }
    setMaking(false);
  }

  async function disableSharing() {
    await supabase.from("trips").update({ is_public: false }).eq("id", trip.id);
    setIsPublic(false);
  }

  function copyLink() {
    if (!shareUrl) return;
    if (Platform.OS === "web") {
      navigator.clipboard.writeText(shareUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if (!shareUrl) return;
    await Share.share({ message: `Follow my trip "${trip.name}" live: ${shareUrl}`, url: shareUrl });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingTop: 32 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#262626" }}>Share Trip</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#6b6b6b", letterSpacing: 0.5, textTransform: "uppercase" }}>Close</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 14, fontWeight: "700", color: "#262626", marginBottom: 4 }}>{trip.name}</Text>
        <View style={{ height: 1, backgroundColor: "#e6e6e6", marginBottom: 20 }} />

        {!isPublic ? (
          /* Sharing disabled */
          <View>
            <Text style={{ fontSize: 13, color: "#6b6b6b", fontWeight: "300", marginBottom: 20, lineHeight: 20 }}>
              Sharing is off. Enable it to generate a public link anyone can open to follow your trip live.
            </Text>

            {/* Expiry picker */}
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 8 }}>Link Expires</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={String(opt.hours)}
                  onPress={() => setExpiryHours(opt.hours ?? null)}
                  style={{
                    flex: 1, padding: 10, alignItems: "center", borderWidth: 1,
                    borderColor: expiryHours === (opt.hours ?? null) ? "#1c69d4" : "#e6e6e6",
                    backgroundColor: expiryHours === (opt.hours ?? null) ? "#e8f0fb" : "#fff",
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: expiryHours === (opt.hours ?? null) ? "#1c69d4" : "#6b6b6b" }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional password */}
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 8 }}>
              Password <Text style={{ fontWeight: "300", textTransform: "none", letterSpacing: 0 }}>(optional)</Text>
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#e6e6e6", padding: 12, fontSize: 14, color: "#262626", marginBottom: 20 }}
              placeholder="Leave blank for no password"
              placeholderTextColor="#c0c0c0"
              value={sharePassword}
              onChangeText={setSharePassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={{ backgroundColor: "#1c69d4", padding: 16, alignItems: "center" }}
              onPress={enableSharing}
              disabled={making}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>
                {making ? "Generating Link..." : "Enable Sharing"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Sharing enabled */
          <View style={{ gap: 12 }}>
            {/* Share URL */}
            <View>
              <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 6 }}>Share Link</Text>
              <View style={{ flexDirection: "row", borderWidth: 1, borderColor: "#e6e6e6" }}>
                <Text style={{ flex: 1, padding: 12, fontSize: 12, color: "#3c3c3c", fontWeight: "300" }} numberOfLines={1}>
                  {shareUrl}
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: copied ? "#22c55e" : "#1c69d4", paddingHorizontal: 16, justifyContent: "center" }}
                  onPress={copyLink}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
                    {copied ? "COPIED" : "COPY"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Share natively */}
            {Platform.OS !== "web" && (
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: "#1c69d4", padding: 14, alignItems: "center" }}
                onPress={nativeShare}
              >
                <Text style={{ color: "#1c69d4", fontWeight: "700", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>Share via...</Text>
              </TouchableOpacity>
            )}

            {/* Google Earth / GPX */}
            <View>
              <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 6, marginTop: 8 }}>
                Export for Google Earth & GPS Tools
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, borderWidth: 1, borderColor: "#e6e6e6", padding: 12, alignItems: "center" }}
                  onPress={() => Platform.OS === "web" && kmlUrl && window.open(kmlUrl, "_blank")}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#262626", letterSpacing: 0.5 }}>KML</Text>
                  <Text style={{ fontSize: 10, color: "#9a9a9a", fontWeight: "300", marginTop: 2 }}>Google Earth</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, borderWidth: 1, borderColor: "#e6e6e6", padding: 12, alignItems: "center" }}
                  onPress={() => Platform.OS === "web" && gpxUrl && window.open(gpxUrl, "_blank")}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#262626", letterSpacing: 0.5 }}>GPX</Text>
                  <Text style={{ fontSize: 10, color: "#9a9a9a", fontWeight: "300", marginTop: 2 }}>Garmin / Gaia</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Disable sharing */}
            <TouchableOpacity
              style={{ marginTop: 16, borderWidth: 1, borderColor: "#fecaca", padding: 14, alignItems: "center" }}
              onPress={disableSharing}
            >
              <Text style={{ color: "#dc2626", fontWeight: "700", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>Disable Sharing</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
