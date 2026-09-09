import { Stack } from "expo-router";

export default function TripsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#3E5F44" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "700", fontSize: 15 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Trip" }} />
    </Stack>
  );
}
