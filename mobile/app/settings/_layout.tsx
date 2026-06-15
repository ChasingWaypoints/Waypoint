import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1c69d4",
        headerTitleStyle: { fontWeight: "700", fontSize: 15 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="devices" options={{ title: "Devices" }} />
      <Stack.Screen name="add-device" options={{ title: "Add Device" }} />
      <Stack.Screen name="setup-garmin" options={{ title: "Garmin inReach" }} />
      <Stack.Screen name="setup-spot" options={{ title: "SPOT Tracker" }} />
      <Stack.Screen name="setup-zoleo" options={{ title: "ZOLEO" }} />
      <Stack.Screen name="privacy-zones" options={{ title: "Privacy Zones" }} />
    </Stack>
  );
}
