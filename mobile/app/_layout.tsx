import "../global.css";
// Must run at module-evaluation time so TaskManager.defineTask() registers the
// background location task before any navigation renders.
import "../lib/backgroundTracking";
import { breakCrashLoopIfNeeded } from "../lib/backgroundTracking";
// Sets the Mapbox access token exactly once, before any screen can mount a map.
import "../lib/mapbox";
import { theme } from "../lib/theme";
import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { ONBOARDING_KEY } from "./(auth)/onboarding";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Before anything else: if the last background run died, stop tracking so the
  // app cannot be killed again on launch.
  useEffect(() => {
    breakCrashLoopIfNeeded();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (session) {
      router.replace("/(tabs)");
      return;
    }
    // Show onboarding on first launch, login screen on subsequent launches
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (done) {
        router.replace("/(auth)/login");
      } else {
        router.replace("/(auth)/onboarding");
      }
    });
  }, [initialized, session]);

  return (
    // Without this provider useSafeAreaInsets() returns zeros, which is how the
    // tab bar ended up underneath the system navigation buttons.
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.canvas },
        }}
      />
    </SafeAreaProvider>
  );
}
