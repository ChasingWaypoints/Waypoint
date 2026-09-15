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
  /** null until we've read storage. Never route on a guess. */
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Before anything else: if the last background run died, stop tracking so the
  // app cannot be killed again on launch.
  useEffect(() => {
    breakCrashLoopIfNeeded();
  }, []);

  useEffect(() => {
    // Resolve the session AND the onboarding flag before routing anywhere.
    // Reading them in sequence is what made the intro carousel come back on
    // every launch: the storage read landed first, the decision was made while
    // session was still null, and onboarding won the race before the restored
    // session could bump it.
    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem(ONBOARDING_KEY),
    ]).then(([{ data: { session } }, done]) => {
      setSession(session);
      // Having a session at all means this rider is long past the intro.
      setOnboarded(done === "true" || !!session);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // Signing in retires the intro for good, so signing out later drops
        // the rider at the login screen rather than back through the slides.
        setOnboarded(true);
        AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized || onboarded === null) return;
    if (session) {
      router.replace("/(tabs)");
      return;
    }
    // The slides are a once-ever thing, not a greeting.
    router.replace(onboarded ? "/(auth)/login" : "/(auth)/onboarding");
  }, [initialized, session, onboarded]);

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
