import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, TextInput, ActivityIndicator, Alert,
} from "react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";

interface PrivacyZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

const RADIUS_OPTIONS = [
  { label: "100m", value: 100 },
  { label: "250m", value: 250 },
  { label: "500m", value: 500 },
  { label: "1 km",  value: 1000 },
  { label: "2 km",  value: 2000 },
  { label: "5 km",  value: 5000 },
];

export default function PrivacyZonesScreen() {
  const [zones, setZones] = useState<PrivacyZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [zoneName, setZoneName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusM, setRadiusM] = useState(500);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { loadZones(); }, []);

  async function loadZones() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("privacy_zones")
      .select("id, name, lat, lng, radius_m")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (data) setZones(data);
    setLoading(false);
  }

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Enable location access in Settings to use this feature.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(loc.coords.latitude.toFixed(6));
      setLng(loc.coords.longitude.toFixed(6));
    } catch {
      Alert.alert("Error", "Could not get your current location.");
    } finally {
      setLocating(false);
    }
  }

  function openModal() {
    setZoneName("");
    setLat("");
    setLng("");
    setRadiusM(500);
    setFormError("");
    setShowModal(true);
  }

  async function saveZone() {
    setFormError("");
    if (!zoneName.trim()) { setFormError("Zone name is required."); return; }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) { setFormError("Valid latitude and longitude are required."); return; }
    if (parsedLat < -90 || parsedLat > 90) { setFormError("Latitude must be between -90 and 90."); return; }
    if (parsedLng < -180 || parsedLng > 180) { setFormError("Longitude must be between -180 and 180."); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("privacy_zones")
      .insert({ user_id: user.id, name: zoneName.trim(), lat: parsedLat, lng: parsedLng, radius_m: radiusM })
      .select("id, name, lat, lng, radius_m")
      .single();

    if (error) { setFormError(error.message); }
    else if (data) {
      setZones((prev) => [...prev, data]);
      setShowModal(false);
    }
    setSaving(false);
  }

  async function deleteZone(id: string) {
    Alert.alert("Delete Zone", "Remove this privacy zone?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("privacy_zones").delete().eq("id", id);
          setZones((prev) => prev.filter((z) => z.id !== id));
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f7f7f7" }}>
      <ScrollView contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 24 }}>

        {/* Explainer */}
        <View style={{ backgroundColor: "#e8f0fb", padding: 16, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: "#1c69d4" }}>
          <Text style={{ fontSize: 13, color: "#1a2129", fontWeight: "600", marginBottom: 4 }}>How privacy zones work</Text>
          <Text style={{ fontSize: 12, color: "#3c3c3c", fontWeight: "300", lineHeight: 18 }}>
            GPS points recorded inside a privacy zone are automatically removed from shared links. Your home, camp, or any place you want kept private.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#1c69d4" />
        ) : zones.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e6e6e6", padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#262626", marginBottom: 6 }}>No privacy zones</Text>
            <Text style={{ fontSize: 13, color: "#6b6b6b", fontWeight: "300", textAlign: "center" }}>
              Add a zone to mask your home or camp from public share links.
            </Text>
          </View>
        ) : (
          zones.map((zone) => (
            <View
              key={zone.id}
              style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e6e6e6", marginBottom: 10, flexDirection: "row", alignItems: "center", padding: 16 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#262626", marginBottom: 2 }}>🔒 {zone.name}</Text>
                <Text style={{ fontSize: 11, color: "#9a9a9a", fontWeight: "300" }}>
                  {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)} · {zone.radius_m >= 1000 ? `${zone.radius_m / 1000} km` : `${zone.radius_m} m`} radius
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteZone(zone.id)} style={{ padding: 8 }}>
                <Text style={{ color: "#dc2626", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 }}>DELETE</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Zone FAB */}
      <View style={{ padding: 24, paddingTop: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e6e6e6" }}>
        <TouchableOpacity
          style={{ backgroundColor: "#1c69d4", padding: 16, alignItems: "center" }}
          onPress={openModal}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>+ Add Privacy Zone</Text>
        </TouchableOpacity>
      </View>

      {/* Add Zone Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 24, paddingTop: 32 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#1a2129" }}>New Privacy Zone</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#6b6b6b", letterSpacing: 0.5, textTransform: "uppercase" }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Zone name */}
          <Text style={labelStyle}>Zone Name</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. Home, Camp, Work"
            placeholderTextColor="#9a9a9a"
            value={zoneName}
            onChangeText={setZoneName}
            autoFocus
          />

          {/* Location */}
          <Text style={[labelStyle, { marginTop: 20 }]}>Location</Text>
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: "#1c69d4", padding: 12, alignItems: "center", marginBottom: 10 }}
            onPress={useCurrentLocation}
            disabled={locating}
          >
            {locating
              ? <ActivityIndicator color="#1c69d4" size="small" />
              : <Text style={{ color: "#1c69d4", fontWeight: "700", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>📍 Use Current Location</Text>
            }
          </TouchableOpacity>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[labelStyle, { marginBottom: 6 }]}>Latitude</Text>
              <TextInput
                style={inputStyle}
                placeholder="37.7749"
                placeholderTextColor="#9a9a9a"
                value={lat}
                onChangeText={setLat}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[labelStyle, { marginBottom: 6 }]}>Longitude</Text>
              <TextInput
                style={inputStyle}
                placeholder="-122.4194"
                placeholderTextColor="#9a9a9a"
                value={lng}
                onChangeText={setLng}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Radius */}
          <Text style={[labelStyle, { marginTop: 20, marginBottom: 10 }]}>Masking Radius</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {RADIUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setRadiusM(opt.value)}
                style={{
                  paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1,
                  borderColor: radiusM === opt.value ? "#1c69d4" : "#e6e6e6",
                  backgroundColor: radiusM === opt.value ? "#e8f0fb" : "#fff",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: radiusM === opt.value ? "#1c69d4" : "#6b6b6b" }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {formError ? (
            <Text style={{ color: "#dc2626", fontSize: 13, marginTop: 16 }}>{formError}</Text>
          ) : null}

          <TouchableOpacity
            style={{ backgroundColor: "#1c69d4", padding: 16, alignItems: "center", marginTop: 28 }}
            onPress={saveZone}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" }}>Save Zone</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const labelStyle = {
  fontSize: 10 as const,
  fontWeight: "700" as const,
  letterSpacing: 1.5,
  color: "#9a9a9a",
  textTransform: "uppercase" as const,
  marginBottom: 8,
};

const inputStyle = {
  borderWidth: 1,
  borderColor: "#e6e6e6",
  padding: 12,
  fontSize: 15,
  color: "#262626",
  fontWeight: "300" as const,
  borderRadius: 0,
};
