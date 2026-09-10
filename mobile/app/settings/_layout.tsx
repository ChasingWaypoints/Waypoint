import { Stack } from "expo-router";
import { stackHeader, theme } from "../../lib/theme";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{ ...stackHeader, contentStyle: { backgroundColor: theme.canvas } }}
    >
      <Stack.Screen name="beacon" options={{ title: "Phone Beacon" }} />
      <Stack.Screen name="devices" options={{ title: "Devices" }} />
      <Stack.Screen name="add-device" options={{ title: "Add Device" }} />
      <Stack.Screen name="setup-garmin" options={{ title: "Garmin inReach" }} />
      <Stack.Screen name="setup-spot" options={{ title: "SPOT Tracker" }} />
      <Stack.Screen name="setup-zoleo" options={{ title: "ZOLEO" }} />
      <Stack.Screen name="privacy-zones" options={{ title: "Privacy Zones" }} />
      <Stack.Screen name="account" options={{ title: "Account Details" }} />
    </Stack>
  );
}
