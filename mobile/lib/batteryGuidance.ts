/**
 * batteryGuidance.ts
 *
 * The single biggest cause of "it stopped tracking when my screen went off" on
 * Android is not our code — it is the OEM battery killer. Samsung, Xiaomi,
 * OnePlus, Oppo and Huawei all ship aggressive app-sleep policies that will
 * suspend a foreground service after a while, with no error and no callback.
 * The task simply stops being called.
 *
 * Android gives no API to *read* whether we are exempt without a native module,
 * and REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is a restricted Play permission we
 * do not want to justify. So we do the honest thing: explain it once, and open
 * the right settings screen so the rider can grant it themselves.
 */

import { Platform, Linking } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACK_KEY = "waypoint_battery_guidance_ack";

export function needsBatteryGuidance(): boolean {
  return Platform.OS === "android";
}

export async function hasAcknowledged(): Promise<boolean> {
  return (await AsyncStorage.getItem(ACK_KEY)) === "1";
}

export async function acknowledge(): Promise<void> {
  await AsyncStorage.setItem(ACK_KEY, "1");
}

/**
 * Opens the system list of battery-optimised apps. Falls back to this app's
 * own settings page, then to settings at large — OEM skins move these around,
 * and a wrong-but-close screen beats a dead button.
 */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== "android") return;

  const attempts: (() => Promise<unknown>)[] = [
    () =>
      IntentLauncher.startActivityAsync(
        "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"
      ),
    () =>
      IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: "package:com.chasingwaypoints.waypoint" }
      ),
    () => Linking.openSettings(),
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // try the next one
    }
  }
}

/** Shown once, in the rider's terms, before they ride somewhere it matters. */
export const BATTERY_GUIDANCE_TITLE = "Keep tracking alive with the screen off";
export const BATTERY_GUIDANCE_BODY =
  "Android may put Waypoint to sleep to save battery, which silently stops tracking mid-ride. " +
  "Set Waypoint to Unrestricted (or turn battery optimization off for it) so your position keeps " +
  "going out while your phone is in your pocket.";
