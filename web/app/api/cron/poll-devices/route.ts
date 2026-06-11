import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { parseGarminKML } from "../../../../lib/parsers/garmin";
import { parseSPOTXML } from "../../../../lib/parsers/spot";

// Called by Upstash QStash every 2 minutes (heartbeat)
// Each device has its own poll_interval_minutes — only polls when due
// Also callable manually: GET /api/cron/poll-devices
export async function GET() {
  const supabase = await createClient();

  // Get all active devices that need polling (garmin + spot only — zoleo uses webhooks)
  const { data: devices, error } = await supabase
    .from("devices")
    .select("id, user_id, type, feed_url, poll_interval_minutes, last_polled_at")
    .eq("is_active", true)
    .in("type", ["garmin", "spot"]);

  // Filter to only devices that are due for a poll based on their interval
  const now = Date.now();
  const dueDevices = (devices ?? []).filter((d) => {
    if (!d.last_polled_at) return true; // never polled — always due
    const intervalMs = (d.poll_interval_minutes ?? 10) * 60 * 1000;
    const lastPollMs = new Date(d.last_polled_at).getTime();
    return now - lastPollMs >= intervalMs;
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dueDevices.length) return NextResponse.json({ polled: 0, skipped: devices?.length ?? 0 });

  const results = await Promise.allSettled(
    dueDevices.map((device) => pollDevice(supabase, device))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ polled: dueDevices.length, succeeded, failed, skipped: (devices?.length ?? 0) - dueDevices.length });
}

async function pollDevice(supabase: Awaited<ReturnType<typeof createClient>>, device: {
  id: string;
  user_id: string;
  type: string;
  feed_url: string | null;
}) {
  try {
    // Find the active trip linked to this device, or fall back to most recent active trip
    const { data: linkedTrip } = await supabase
      .from("trips")
      .select("id")
      .eq("user_id", device.user_id)
      .eq("status", "active")
      .eq("device_id", device.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    const trip = linkedTrip ?? await (async () => {
      const { data } = await supabase
        .from("trips")
        .select("id")
        .eq("user_id", device.user_id)
        .eq("status", "active")
        .is("device_id", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .single();
      return data;
    })();

    if (!trip) {
      await supabase.from("devices").update({ last_polled_at: new Date().toISOString(), poll_error: "No active trip" }).eq("id", device.id);
      return;
    }

    // Fetch the feed — both Garmin and SPOT use the stored feed_url directly
    let rawBody = "";
    if ((device.type === "garmin" || device.type === "spot") && device.feed_url) {
      const res = await fetch(device.feed_url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawBody = await res.text();
    }

    // Parse points
    const rawPoints = device.type === "garmin" ? parseGarminKML(rawBody) : parseSPOTXML(rawBody);
    if (!rawPoints.length) {
      await supabase.from("devices").update({ last_polled_at: new Date().toISOString(), poll_error: null }).eq("id", device.id);
      return;
    }

    // Get latest stored point to deduplicate
    const { data: latest } = await supabase
      .from("track_points")
      .select("recorded_at")
      .eq("trip_id", trip.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    const latestTime = latest ? new Date(latest.recorded_at).getTime() : 0;

    // Filter to only new points
    const newPoints = rawPoints
      .filter((p) => new Date(p.recorded_at).getTime() > latestTime)
      .map((p) => ({
        trip_id: trip.id,
        device_id: device.id,
        lat: p.lat,
        lng: p.lng,
        altitude_m: p.altitude_m,
        speed_kmh: p.speed_kmh,
        message: p.message,
        source: device.type,
        recorded_at: p.recorded_at,
      }));

    if (newPoints.length) {
      await supabase.from("track_points").insert(newPoints);
    }

    await supabase.from("devices").update({
      last_polled_at: new Date().toISOString(),
      poll_error: null,
    }).eq("id", device.id);

  } catch (err) {
    await supabase.from("devices").update({
      last_polled_at: new Date().toISOString(),
      poll_error: err instanceof Error ? err.message : "Unknown error",
    }).eq("id", device.id);
    throw err;
  }
}
