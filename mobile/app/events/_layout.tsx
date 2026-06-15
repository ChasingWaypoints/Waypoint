import { Stack } from "expo-router";

export default function EventsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1c69d4",
        headerTitleStyle: { fontWeight: "700", fontSize: 15 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="create" options={{ title: "Create Event" }} />
      <Stack.Screen name="join" options={{ title: "Join Event" }} />
      <Stack.Screen name="[id]" options={{ title: "Event" }} />
    </Stack>
  );
}
