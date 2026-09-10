/**
 * beaconSync.ts
 *
 * Drains the offline queue to Supabase. Split out from the background task so
 * the Status screen can trigger a manual flush and so the flush logic can be
 * tested without a GPS fix.
 *
 * Two destinations:
 *   trip  → track_points        (personal ride, keyed by trip_id)
 *   event → ingest_phone_points (event map, keyed by participant_id + event_id)
 *
 * Both are idempotent server-side, so a flush interrupted mid-request is safe
 * to retry: worst case the same rows are offered twice and the second attempt
 * inserts nothing.
 */

import * as Network from "expo-network";
import { supabase } from "./supabase";
import { peek, drop, pendingCount, type QueuedPing } from "./pingQueue";
import { getDeviceToken } from "./deviceIdentity";

/** One request per burst. Small enough to survive a marginal connection. */
const BATCH_SIZE = 200;

export type FlushResult = {
  sent: number;
  remaining: number;
  skipped?: "offline" | "no-session" | "in-progress";
};

let flushing = false;

export async function flushQueue(): Promise<FlushResult> {
  if (flushing) {
    return { sent: 0, remaining: await pendingCount(), skipped: "in-progress" };
  }

  // Cheap early exit. A failed round trip on a dead connection costs battery
  // and, on a metered satellite link, real money.
  try {
    const net = await Network.getNetworkStateAsync();
    if (!net.isInternetReachable) {
      return { sent: 0, remaining: await pendingCount(), skipped: "offline" };
    }
  } catch {
    // Network module unavailable — fall through and just try the request.
  }

  // A session is optional. Event points authenticate with the device token, so
  // a rider who never signed in still uploads. Personal trip points write to
  // track_points under RLS and do need one — those stay queued until sign-in.
  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session;

  flushing = true;
  let sent = 0;

  try {
    // Keep draining while batches keep succeeding, so a rider who crests a
    // ridge after four hours off-grid uploads the whole day, not 200 points.
    for (;;) {
      const batch = await peek(BATCH_SIZE);
      if (!batch.length) break;

      const groups = groupByDestination(batch);
      let progressed = false;

      for (const group of groups) {
        const ok = await sendGroup(group, hasSession);
        if (!ok) continue;
        await drop(group.rows.map((r) => r.id!).filter(Boolean));
        sent += group.rows.length;
        progressed = true;
      }

      // Nothing in this batch could be sent — stop rather than spin.
      if (!progressed) break;
    }
  } finally {
    flushing = false;
  }

  return { sent, remaining: await pendingCount() };
}

type Group = {
  mode: "trip" | "event";
  contextId: string;
  participantId: string | null;
  rows: QueuedPing[];
};

/**
 * A single batch can straddle a mode change — the rider stopped a personal trip
 * and joined an event mid-queue — so rows are grouped before sending.
 */
function groupByDestination(rows: QueuedPing[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.mode}:${r.context_id}:${r.participant_id ?? ""}`;
    let g = map.get(key);
    if (!g) {
      g = {
        mode: r.mode,
        contextId: r.context_id,
        participantId: r.participant_id,
        rows: [],
      };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  return [...map.values()];
}

async function sendGroup(g: Group, hasSession: boolean): Promise<boolean> {
  try {
    if (g.mode === "event") {
      const points = g.rows.map((r) => ({
        recorded_at: r.recorded_at,
        lat: r.lat,
        lng: r.lng,
        altitude_m: r.altitude_m,
        speed_kmh: r.speed_kmh,
        accuracy_m: r.accuracy_m,
        heading_deg: r.heading_deg,
        battery_pct: r.battery_pct,
      }));

      // Primary path: the device token. Works signed out, and the server
      // resolves the participant itself so the phone can't spoof one.
      const token = await getDeviceToken();
      const { data: beaconData, error: beaconErr } = await supabase.rpc(
        "beacon_ingest",
        { p_token: token, p_points: points }
      );
      if (!beaconErr && (beaconData as any)?.ok) return true;

      const reason = beaconErr?.message ?? (beaconData as any)?.error;
      // Only fall back when a session can actually do better — an unclaimed
      // device or an unset event is not something a retry fixes.
      if (!hasSession || !g.participantId) {
        console.warn("[sync] beacon ingest refused:", reason);
        return false;
      }

      const { error } = await supabase.rpc("ingest_phone_points", {
        p_participant_id: g.participantId,
        p_event_id: g.contextId,
        p_points: points,
      });
      if (error) {
        console.warn("[sync] event flush failed:", error.message);
        return false;
      }
      return true;
    }

    if (!hasSession) return false; // trip points are RLS-protected

    const { error } = await supabase.from("track_points").insert(
      g.rows.map((r) => ({
        trip_id: g.contextId,
        lat: r.lat,
        lng: r.lng,
        altitude_m: r.altitude_m,
        speed_kmh: r.speed_kmh,
        accuracy_m: r.accuracy_m,
        heading_deg: r.heading_deg,
        battery_pct: r.battery_pct,
        source: "phone",
        recorded_at: r.recorded_at,
      }))
    );
    if (error) {
      console.warn("[sync] trip flush failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[sync] flush threw:", err);
    return false;
  }
}
