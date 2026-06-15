import "../global.css";
import { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { ONBOARDING_KEY } from "./(auth)/onboarding";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

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
    <Stack screenOptions={{ headerShown: false }} />
  );
}
