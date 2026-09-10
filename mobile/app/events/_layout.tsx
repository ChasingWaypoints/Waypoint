import { Stack } from "expo-router";
import { stackHeader, theme } from "../../lib/theme";

export default function EventsLayout() {
  return (
    <Stack
      screenOptions={{ ...stackHeader, contentStyle: { backgroundColor: theme.canvas } }}
    >
      <Stack.Screen name="create" options={{ title: "Create Event" }} />
      <Stack.Screen name="join" options={{ title: "Join Event" }} />
      <Stack.Screen name="[id]" options={{ title: "Event" }} />
    </Stack>
  );
}
