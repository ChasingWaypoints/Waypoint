import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import TripMap from "../../components/TripMap";

interface Trip {
  id: string;
  name: string;
  status: string;
}

export default function MapScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoaded(true); return; }
    const { data } = await supabase
      .from("trips")
      .select("id, name, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      setTrips(data);
      const active = data.find((t) => t.status === "active");
      if (active) setSelectedTrip(active);
      else if (data[0]) setSelectedTrip(data[0]);
    }
    setLoaded(true);
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Trip selector — only shown when trips exist */}
      {trips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-hairline"
          style={{ maxHeight: 48, flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              onPress={() => setSelectedTrip(trip)}
              className={`mr-4 py-3 border-b-2 ${selectedTrip?.id === trip.id ? "border-primary" : "border-transparent"}`}
            >
              <Text className={`text-xs font-bold uppercase tracking-widest ${selectedTrip?.id === trip.id ? "text-primary" : "text-muted"}`}>
                {trip.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Map — always rendered on web, shows demo view when no trip */}
      <View className="flex-1" style={{ position: "relative" }}>
        {Platform.OS === "web" ? (
          <TripMap tripId={selectedTrip?.id ?? "demo"} />
        ) : (
          <View className="flex-1 bg-surface-dark items-center justify-center">
            <Text className="text-on-dark-soft text-sm font-light">Map requires a development build</Text>
          </View>
        )}

        {/* No trips overlay — shown on top of map */}
        {loaded && trips.length === 0 && (
          <View style={{
            position: "absolute", bottom: 60, left: 16, right: 16,
            backgroundColor: "#1a2129", padding: 16,
          }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 0.5 }}>
              NO ACTIVE TRIP
            </Text>
            <Text style={{ color: "#bbbbbb", fontSize: 12, fontWeight: "300", marginTop: 4 }}>
              Start a trip from the Trips tab to track your route here.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
