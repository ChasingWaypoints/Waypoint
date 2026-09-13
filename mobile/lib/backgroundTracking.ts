/**
 * backgroundTracking.ts
 *
 * Registers the expo-task-manager background location task and exposes the
 * start / stop / status helpers used by the Track screen.
 *
 * IMPORTANT: This module must be imported before any navigation renders so
 * that TaskManager.defineTask() runs at module-evaluation time. Import it at
 * the top of app/_layout.tsx with:
 *   import "../lib/backgroundTracking";
 *
 * Design notes:
 *  - Fixes go to SQLite first (pingQueue) and are only deleted once the server
 *    has them. Nothing is lost in a dead zone.
 *  - The session can target a personal trip or an event. Event mode writes to
 *    event_track_points via ingest_phone_points, which is what actually puts a
 *    rider on the organizer's live map.
 *  - Cadence adapts to movement. A parked bike does not deserve a fix every
 *    30 seconds, and the battery is the thing riders actually judge us on.
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Battery from "expo-battery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";
import { initQueue, enqueue, pendingCount } from "./pingQueue";
import { flushQueue } from "./beaconSync";

export const BG_LOCATION_TASK = "waypoint-bg-location";

const SESSION_KEY = "waypoint_beacon_session";
const TIER_KEY = "waypoint_beacon_tier";
const LAST_FIX_KEY = "waypoint_beacon_last_fix";
/** Wall-clock of the last fix the OS actually delivered. The honest heartbeat. */
const LAST_FIX_AT_KEY = "waypoint_beacon_last_fix_at";
/**
 * Breadcrumb for the start sequence. A native crash kills the process before
 * any JS error handler runs and there is no logcat on a rider's phone, so each
 * step is written to disk BEFORE it is attempted. Whatever is still there after
 * a relaunch is the step that died.
 */
const START_STEP_KEY = "waypoint_beacon_start_step";
/** Same idea, for the background task callback — the other place we can die. */
const TASK_STEP_KEY = "waypoint_beacon_task_step";

// Brand: dark ground, acid accents. The old #FAA634 was in no part of the palette.
const NOTIFICATION_COLOR = "#CCFF00";

export type BeaconSession =
  | { mode: "trip"; tripId: string }
  | { mode: "event"; eventId: string; participantId: string; eventName?: string };

// ─── Cadence tiers ────────────────────────────────────────────────────────────
// Chosen automatically from movement; Settings can pin one. Intervals are what
// we ask the OS for — iOS in particular treats them as a hint, not a contract.

export type Tier = "race" | "trail" | "idle" | "parked";

type TierSpec = { timeInterval: number; distanceInterval: number; accuracy: Location.LocationAccuracy };

// distanceInterval is a *displacement filter*: the OS withholds every fix until
// the phone has moved that far. Combined with timeInterval it does not mean
// "whichever comes first" — it means both must be satisfied. With 50 m on the
// race tier, a rider sitting at the start line produced no fixes at all, ever,
// and the tiers already control the rate. So the filter is off, and cadence is
// purely time-driven.
const TIERS: Record<Tier, TierSpec> = {
  race:   { timeInterval: 30_000,  distanceInterval: 0, accuracy: Location.Accuracy.High },
  trail:  { timeInterval: 60_000,  distanceInterval: 0, accuracy: Location.Accuracy.High },
  idle:   { timeInterval: 300_000, distanceInterval: 0, accuracy: Location.Accuracy.Balanced },
  parked: { timeInterval: 900_000, distanceInterval: 0, accuracy: Location.Accuracy.Balanced },
};

/** Metres of movement below which the rider counts as stationary. */
const STATIONARY_M = 50;
/** Stationary this long → idle. */
const IDLE_AFTER_MS = 5 * 60_000;
/** Stationary this long → parked. */
const PARKED_AFTER_MS = 30 * 60_000;

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function getSession(): Promise<BeaconSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BeaconSession;
  } catch {
    return null;
  }
}

async function setSession(s: BeaconSession | null): Promise<void> {
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

export async function getTier(): Promise<Tier> {
  return ((await AsyncStorage.getItem(TIER_KEY)) as Tier) ?? "trail";
}

// ─── Task definition (must be at module level) ────────────────────────────────
try {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error("[BG] Location task error:", error.message);
      return;
    }

    const locations: Location.LocationObject[] | undefined = data?.locations;
    if (!locations?.length) return;

    const session = await getSession();
    if (!session) {
      console.warn("[BG] No beacon session — points dropped.");
      return;
    }

    // The task callback runs headless: a native crash here leaves no trace at
    // all. Breadcrumb each step the same way the start sequence does.
    await AsyncStorage.setItem(TASK_STEP_KEY, "open-queue-database");
    await initQueue();

    await AsyncStorage.setItem(TASK_STEP_KEY, "read-battery");
    let battery: number | null = null;
    try {
      const level = await Battery.getBatteryLevelAsync();
      battery = level >= 0 ? Math.round(level * 100) : null;
    } catch (e) {
      console.warn("[BG] battery read failed:", e);
      battery = null;
    }

    await AsyncStorage.setItem(TASK_STEP_KEY, "queue-points");

    // The OS batches deliveries; queue every fix, not just the newest.
    for (const loc of locations) {
      await enqueue({
        recorded_at: new Date(loc.timestamp).toISOString(),
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        altitude_m: loc.coords.altitude ?? null,
        speed_kmh: loc.coords.speed != null && loc.coords.speed >= 0
          ? loc.coords.speed * 3.6
          : null,
        accuracy_m: loc.coords.accuracy ?? null,
        heading_deg: loc.coords.heading != null && loc.coords.heading >= 0
          ? loc.coords.heading
          : null,
        battery_pct: battery,
        mode: session.mode,
        context_id: session.mode === "trip" ? session.tripId : session.eventId,
        participant_id: session.mode === "event" ? session.participantId : null,
      });
    }

    const newest = locations[locations.length - 1];
    await AsyncStorage.setItem(LAST_FIX_AT_KEY, String(Date.now()));

    await AsyncStorage.setItem(TASK_STEP_KEY, "adjust-cadence");
    await maybeRetier(newest);

    // Best-effort. If it fails the fixes stay queued, which is the point.
    await AsyncStorage.setItem(TASK_STEP_KEY, "upload");
    const result = await flushQueue();
    await AsyncStorage.removeItem(TASK_STEP_KEY);
    if (result.remaining > 0) {
      console.log(`[BG] ${result.sent} sent, ${result.remaining} still queued`);
    }
  });
} catch (e) {
  console.warn("[BG] Could not define location task — background tracking unavailable:", e);
}

// ─── Adaptive cadence ─────────────────────────────────────────────────────────

async function maybeRetier(fix: Location.LocationObject): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const raw = await AsyncStorage.getItem(LAST_FIX_KEY);
  const now = fix.timestamp;
  let anchor: { lat: number; lng: number; since: number } | null = null;
  try {
    anchor = raw ? JSON.parse(raw) : null;
  } catch {
    anchor = null;
  }

  if (!anchor) {
    await AsyncStorage.setItem(
      LAST_FIX_KEY,
      JSON.stringify({ lat: fix.coords.latitude, lng: fix.coords.longitude, since: now })
    );
    return;
  }

  const moved = haversineM(anchor.lat, anchor.lng, fix.coords.latitude, fix.coords.longitude);

  if (moved > STATIONARY_M) {
    // Moving: reset the anchor and go back to the session's active tier.
    await AsyncStorage.setItem(
      LAST_FIX_KEY,
      JSON.stringify({ lat: fix.coords.latitude, lng: fix.coords.longitude, since: now })
    );
    await applyTier(session.mode === "event" ? "race" : "trail");
    return;
  }

  const still = now - anchor.since;
  if (still >= PARKED_AFTER_MS) await applyTier("parked");
  else if (still >= IDLE_AFTER_MS) await applyTier("idle");
}

async function applyTier(tier: Tier): Promise<void> {
  const current = await AsyncStorage.getItem(TIER_KEY);
  if (current === tier) return;

  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (!running) return;

  await AsyncStorage.setItem(TIER_KEY, tier);
  const spec = TIERS[tier];
  // Re-issuing start updates the running task in place — but calling it from
  // inside the task's own callback re-enters the native location manager while
  // it is mid-delivery. Defer to a later tick so the callback finishes first.
  setTimeout(() => {
    Location.startLocationUpdatesAsync(BG_LOCATION_TASK, buildOptions(spec)).catch((e) =>
      console.warn("[BG] cadence change failed:", e)
    );
  }, 0);
  console.log(`[BG] cadence → ${tier} (${spec.timeInterval / 1000}s)`);
}

function buildOptions(
  spec: TierSpec,
  withForegroundService = true
): Location.LocationTaskOptions {
  return {
    accuracy: spec.accuracy,
    timeInterval: spec.timeInterval,
    distanceInterval: spec.distanceInterval,
    // Tells iOS this is vehicle movement, which keeps the app scheduled and
    // stops Core Location from quietly pausing updates on a long straight road.
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    ...(withForegroundService
      ? {
          foregroundService: {
            notificationTitle: "Waypoint is tracking",
            notificationBody: "Your position is being recorded and shared.",
            notificationColor: NOTIFICATION_COLOR,
          },
        }
      : {}),
  };
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function step(name: string): Promise<void> {
  await AsyncStorage.setItem(START_STEP_KEY, name);
}

/** Whatever step we died on last time, or null if the last start completed. */
export async function getFailedStartStep(): Promise<string | null> {
  return AsyncStorage.getItem(START_STEP_KEY);
}

export async function clearFailedStartStep(): Promise<void> {
  await AsyncStorage.multiRemove([START_STEP_KEY, TASK_STEP_KEY]);
}

/** Step the background task died on, or null if its last run completed. */
export async function getFailedTaskStep(): Promise<string | null> {
  return AsyncStorage.getItem(TASK_STEP_KEY);
}

export async function startBeacon(session: BeaconSession, tier?: Tier): Promise<void> {
  // Android 13+ needs POST_NOTIFICATIONS for the foreground service notification.
  // Without it the service cannot post its notification, and Android kills the
  // process rather than returning an error we could catch.
  let canPostNotifications = true;
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    await step("notification-permission");
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    canPostNotifications = res === PermissionsAndroid.RESULTS.GRANTED;
  }

  await step("foreground-location-permission");
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== "granted") throw new Error("Foreground location permission denied");

  await step("background-location-permission");
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== "granted") {
    throw new Error(
      "Background location permission denied — set location access to 'Allow all the time' in Settings"
    );
  }

  await step("open-queue-database");
  await initQueue();

  await step("save-session");
  await setSession(session);
  await AsyncStorage.multiRemove([LAST_FIX_KEY, LAST_FIX_AT_KEY]);

  const resolved: Tier = tier ?? (session.mode === "event" ? "race" : "trail");
  await AsyncStorage.setItem(TIER_KEY, resolved);

  await step("stop-existing-task");
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);

  // The foreground service is the riskiest call in the sequence: on Android 14+
  // it throws if the manifest service type is missing, and on 13+ it throws if
  // the notification cannot be posted — both as native exceptions. Try it with
  // the service, and fall back to a plain background task rather than dying.
  await step("start-location-updates");
  try {
    await Location.startLocationUpdatesAsync(
      BG_LOCATION_TASK,
      buildOptions(TIERS[resolved], canPostNotifications)
    );
  } catch (err) {
    console.warn("[BG] foreground service start failed, retrying without it:", err);
    await step("start-location-updates-no-service");
    await Location.startLocationUpdatesAsync(
      BG_LOCATION_TASK,
      buildOptions(TIERS[resolved], false)
    );
  }

  // Got here, so nothing crashed. Clear the breadcrumb.
  await clearFailedStartStep();

  // Even with the filter off, the first scheduled fix is one interval away —
  // up to 30 seconds of a rider staring at "not yet" wondering if it works.
  // Take one now, queue it, and push it.
  void captureImmediateFix(session).catch((e) =>
    console.warn("[BG] immediate fix failed:", e)
  );
}

async function captureImmediateFix(session: BeaconSession): Promise<void> {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  let battery: number | null = null;
  try {
    const level = await Battery.getBatteryLevelAsync();
    battery = level >= 0 ? Math.round(level * 100) : null;
  } catch {
    battery = null;
  }

  await enqueue({
    recorded_at: new Date(loc.timestamp).toISOString(),
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    altitude_m: loc.coords.altitude ?? null,
    speed_kmh:
      loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed * 3.6 : null,
    accuracy_m: loc.coords.accuracy ?? null,
    heading_deg:
      loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
    battery_pct: battery,
    mode: session.mode,
    context_id: session.mode === "trip" ? session.tripId : session.eventId,
    participant_id: session.mode === "event" ? session.participantId : null,
  });

  await AsyncStorage.setItem(LAST_FIX_AT_KEY, String(Date.now()));
  await flushQueue();
}

export async function stopBeacon(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
  await setSession(null);
  await AsyncStorage.multiRemove([LAST_FIX_KEY, LAST_FIX_AT_KEY]);
  // One last drain so a rider who stops in cell coverage uploads immediately.
  await flushQueue().catch(() => undefined);
}

export async function isTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
}

export type BeaconStatus = {
  active: boolean;
  session: BeaconSession | null;
  tier: Tier;
  queued: number;
  /** ms since the OS last handed us a fix, or null if none yet this session. */
  lastFixAgeMs: number | null;
  /**
   * The session says we should be tracking but the OS says we are not. This is
   * what an OEM battery killer looks like from inside the app: no error, no
   * callback, the task simply stops being called. Worth shouting about.
   */
  stalled: boolean;
};

/**
 * How long without a fix before we call it stalled. Generous multiples of the
 * tier interval, because a phone in a canyon can legitimately go quiet for a
 * while without anything being wrong.
 */
const STALL_AFTER: Record<Tier, number> = {
  race: 6 * 60_000,
  trail: 8 * 60_000,
  idle: 20 * 60_000,
  parked: 45 * 60_000,
};

export async function getBeaconStatus(): Promise<BeaconStatus> {
  await initQueue();
  const [active, session, tier, queued, lastFixRaw] = await Promise.all([
    isTrackingActive(),
    getSession(),
    getTier(),
    pendingCount(),
    AsyncStorage.getItem(LAST_FIX_AT_KEY),
  ]);

  const lastFixAt = lastFixRaw ? Number(lastFixRaw) : null;
  const lastFixAgeMs = lastFixAt ? Date.now() - lastFixAt : null;

  // Two ways to be stalled: the OS dropped the task entirely, or it kept the
  // task but stopped delivering fixes.
  const stalled =
    !!session &&
    (!active || (lastFixAgeMs !== null && lastFixAgeMs > STALL_AFTER[tier]));

  return { active, session, tier, queued, lastFixAgeMs, stalled };
}

/**
 * Restart a session the OS killed, without making the rider re-pick anything.
 * Called from the Track screen's recovery banner.
 */
export async function resumeBeacon(): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No session to resume.");
  await startBeacon(session, await getTier());
}

/** Manual "sync now" for the Status screen. */
export async function syncNow() {
  await initQueue();
  return flushQueue();
}

// ─── Back-compat shims ────────────────────────────────────────────────────────
// The Track screen still calls the old trip-only names. These keep it building
// while the screens are reworked.

export async function startBackgroundTracking(tripId: string, intervalSeconds: number): Promise<void> {
  const tier: Tier =
    intervalSeconds <= 60 ? "race" : intervalSeconds <= 300 ? "trail" : "idle";
  await startBeacon({ mode: "trip", tripId }, tier);
}

export async function stopBackgroundTracking(): Promise<void> {
  await stopBeacon();
}

export async function getActiveTripId(): Promise<string | null> {
  const s = await getSession();
  return s?.mode === "trip" ? s.tripId : null;
}
