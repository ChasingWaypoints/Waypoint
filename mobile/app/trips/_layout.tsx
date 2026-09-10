import { Stack } from "expo-router";
import { stackHeader, theme } from "../../lib/theme";

export default function TripsLayout() {
  return (
    <Stack
      screenOptions={{ ...stackHeader, contentStyle: { backgroundColor: theme.canvas } }}
    >
      <Stack.Screen name="[id]" options={{ title: "Trip" }} />
    </Stack>
  );
}
