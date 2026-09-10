import { Tabs } from "expo-router";
import { Text } from "react-native";
import { theme } from "../../lib/theme";

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 18 }}>{icon}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.ink,
        headerTitleStyle: { fontWeight: "700", fontSize: 16, letterSpacing: 0.5 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.canvas },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.hairline,
          borderTopWidth: 1,
          elevation: 0,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        // Acid green marks the active tab, matching the track lines on the map.
        tabBarActiveTintColor: theme.action,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
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
        name="map"
        options={{
          title: "Map",
          tabBarLabel: "MAP",
          tabBarIcon: () => <TabIcon icon="🧭" />,
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
        name="events"
        options={{
          title: "Events",
          tabBarLabel: "EVENTS",
          tabBarIcon: () => <TabIcon icon="🏁" />,
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
