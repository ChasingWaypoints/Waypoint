import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 18 }}>{icon}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#262626",
        headerTitleStyle: { fontWeight: "700", fontSize: 16, letterSpacing: 0.5 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e6e6e6",
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarActiveTintColor: "#1c69d4",
        tabBarInactiveTintColor: "#6b6b6b",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Waypoint",
          tabBarLabel: "TRIPS",
          tabBarIcon: () => <TabIcon icon="🗺️" />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: "Track",
          tabBarLabel: "TRACK",
          tabBarIcon: () => <TabIcon icon="📍" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "SETTINGS",
          tabBarIcon: () => <TabIcon icon="⚙️" />,
        }}
      />
    </Tabs>
  );
}
