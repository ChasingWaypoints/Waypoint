import { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  Dimensions, Animated, NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    icon: "🛰️",
    title: "All Your Devices,\nOne Map",
    body: "Garmin inReach, SPOT, ZOLEO, and your phone GPS tracked together in real time. Waypoint automatically polls your satellite device so you never have a gap in coverage.",
    accent: "#1c69d4",
  },
  {
    icon: "📍",
    title: "Share Your\nAdventure Live",
    body: "Send a single link. Anyone can follow your route on a full-screen map — no app required. Set a password or expiry. Privacy zones keep your home address off the map.",
    accent: "#1a2129",
  },
  {
    icon: "🗺️",
    title: "Export Anywhere\nYou Ride",
    body: "Download your route as GPX for Garmin Basecamp, RideWithGPS, or Gaia GPS. Or KML for Google Earth. Your data, your format.",
    accent: "#1c69d4",
  },
];

export const ONBOARDING_KEY = "wp_onboarding_done";

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  function goToSlide(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentIndex(index);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / width);
    setCurrentIndex(idx);
    scrollX.setValue(x);
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(auth)/login");
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: "#f7f7f7" }}>
      {/* Slide content */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={{ width, flex: 1, padding: 36, paddingTop: 80, justifyContent: "center" }}>
            {/* Icon */}
            <View style={{
              width: 80, height: 80, borderRadius: 0,
              backgroundColor: slide.accent, alignItems: "center", justifyContent: "center",
              marginBottom: 40,
            }}>
              <Text style={{ fontSize: 36 }}>{slide.icon}</Text>
            </View>

            {/* Eyebrow */}
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 2, color: "#9a9a9a", textTransform: "uppercase", marginBottom: 12 }}>
              Waypoint · {i + 1} of {SLIDES.length}
            </Text>

            {/* Title */}
            <Text style={{ fontSize: 32, fontWeight: "800", color: "#1a2129", lineHeight: 38, marginBottom: 20 }}>
              {slide.title}
            </Text>

            {/* Body */}
            <Text style={{ fontSize: 16, color: "#4a4a4a", fontWeight: "300", lineHeight: 26 }}>
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={{ paddingHorizontal: 36, paddingBottom: 48, paddingTop: 20, backgroundColor: "#f7f7f7" }}>
        {/* Dot indicators */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 28 }}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
              <View style={{
                width: i === currentIndex ? 24 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === currentIndex ? "#1c69d4" : "#d0d0d0",
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {isLast ? (
          <TouchableOpacity
            style={{ backgroundColor: "#1c69d4", padding: 18, alignItems: "center" }}
            onPress={finish}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Get Started
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <TouchableOpacity onPress={finish}>
              <Text style={{ fontSize: 13, color: "#9a9a9a", fontWeight: "600" }}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: "#1a2129", paddingVertical: 14, paddingHorizontal: 32 }}
              onPress={() => goToSlide(currentIndex + 1)}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>
                Next
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
