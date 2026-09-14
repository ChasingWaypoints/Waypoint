import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 20 }}>{icon}</Text>;
}

/**
 * Three tabs, deliberately.
 *
 * The app used to carry five — Trips, Map, Track, Events, Settings — which was
 * two apps sharing a tab bar: a trip logger and a live tracker. Organizer work
 * moved to the web, where a roster is actually editable, and personal rides
 * fold into Track. What's left is: where am I, am I sharing it, and everything
 * else. Three fat targets you can hit wearing gloves.
 */
export default function TabsLayout() {
  // A fixed bar height renders underneath the system navigation buttons on
  // phones that have them — the XCover Pro among them. Grow by the inset.
  const insets = useSafeAreaInsets();

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
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
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
