/**
 * backgroundTracking.ts
 *
 * Registers the expo-task-manager background location task and exposes
 * start / stop / status helpers used by the Track screen.
 *
 * IMPORTANT: This module must be imported before any navigation renders so
 * that TaskManager.defineTask() runs at module-evaluation time. Import it at
 * the top of app/_layout.tsx with:
 *   import "../lib/backgroundTracking";
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";
import { supabase } from "./supabase";

export const BG_LOCATION_TASK = "waypoint-bg-location";
const TRIP_ID_KEY = "waypoint_active_trip_id";

// ─── Task definition (must be at module level) ────────────────────────────────
// Wrapped in try-catch so a native module initialisation hiccup doesn't crash
// the root layout at import time.
try {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error("[BG] Location task error:", error.message);
      return;
    }

    const locations: Location.LocationObject[] | undefined = data?.locations;
    if (!locations?.length) return;

    const loc = locations[locations.length - 1];
    const tripId = await AsyncStorage.getItem(TRIP_ID_KEY);
    if (!tripId) {
      console.warn("[BG] No tripId in AsyncStorage — point dropped. Storage permissions may be missing.");
      return;
    }

    try {
      const { error: insertErr } = await supabase.from("track_points").insert({
        trip_id: tripId,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        altitude_m: loc.coords.altitude,
        speed_kmh: loc.coords.speed != null ? loc.coords.speed * 3.6 : null,
        accuracy_m: loc.coords.accuracy,
        source: "phone",
        recorded_at: new Date(loc.timestamp).toISOString(),
      });
      if (insertErr) {
        console.error("[BG] Supabase insert error:", insertErr.message, insertErr.code);
      } else {
        console.log(`[BG] Point recorded for trip ${tripId}: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
      }
    } catch (err) {
      console.error("[BG] Failed to insert track_point:", err);
    }
  });
} catch (e) {
  console.warn("[BG] Could not define location task — background tracking unavailable:", e);
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export async function startBackgroundTracking(
  tripId: string,
  intervalSeconds: number
): Promise<void> {
  // Android 13+ requires POST_NOTIFICATIONS at runtime for foreground service notification
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== "granted") throw new Error("Foreground location permission denied");

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== "granted") throw new Error("Background location permission denied — enable 'Allow all the time' in Settings");

  await AsyncStorage.setItem(TRIP_ID_KEY, tripId);

  // Stop any stale task before restarting
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);

  await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: intervalSeconds * 1000,
    distanceInterval: 10,            // minimum 10 m between points
    foregroundService: {
      notificationTitle: "Waypoint is tracking",
      notificationBody: "Your route is being recorded in the background.",
      notificationColor: "#FAA634",
    },
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
  });
}

export async function stopBackgroundTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  await AsyncStorage.removeItem(TRIP_ID_KEY);
}

export async function isTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
}

/** Returns the tripId currently being tracked, or null. */
export async function getActiveTripId(): Promise<string | null> {
  return AsyncStorage.getItem(TRIP_ID_KEY);
}
