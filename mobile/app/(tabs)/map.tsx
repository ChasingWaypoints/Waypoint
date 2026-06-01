import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
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

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
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
  }

  if (!selectedTrip) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center px-6">
        <Text className="text-ink font-bold text-base mb-2">No trips to display</Text>
        <Text className="text-muted font-light text-sm text-center">
          Start a trip from the Trips tab and begin tracking to see your route here.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Trip selector */}
      {trips.length > 1 && (
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
              className={`mr-4 py-3 border-b-2 ${selectedTrip.id === trip.id ? "border-primary" : "border-transparent"}`}
            >
              <Text className={`text-xs font-bold uppercase tracking-widest ${selectedTrip.id === trip.id ? "text-primary" : "text-muted"}`}>
                {trip.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Map */}
      <View className="flex-1">
        <TripMap tripId={selectedTrip.id} />
      </View>
    </View>
  );
}
