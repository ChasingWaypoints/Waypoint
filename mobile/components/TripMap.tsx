import { View, Text } from "react-native";

interface TripMapProps {
  tripId: string;
}

// Native map placeholder — full Mapbox native via @rnmapbox/maps coming with dev build
export default function TripMap({ tripId: _ }: TripMapProps) {
  return (
    <View className="flex-1 bg-surface-dark items-center justify-center">
      <Text className="text-on-dark-soft text-sm font-light">Map requires a development build</Text>
    </View>
  );
}
