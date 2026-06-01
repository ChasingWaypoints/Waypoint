import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

// POST /api/webhooks/zoleo — real-time location push from ZOLEO
export async function POST(request: NextRequest) {
  const body = await request.json();

  // ZOLEO sends: { deviceId, latitude, longitude, altitude, timestamp, messageText }
  const { deviceId, latitude, longitude, altitude, timestamp, messageText } = body;

  if (!deviceId || !latitude || !longitude) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();

  // Look up the device by ZOLEO device ID
  const { data: device } = await supabase
    .from("devices")
    .select("id, user_id")
    .eq("feed_id", deviceId)
    .eq("type", "zoleo")
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // Find active trip for this device
  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("user_id", device.user_id)
    .eq("device_id", device.id)
    .eq("status", "active")
    .single();

  if (!trip) return NextResponse.json({ ok: true, note: "No active trip" });

  // Insert the track point
  await supabase.from("track_points").insert({
    trip_id: trip.id,
    device_id: device.id,
    lat: parseFloat(latitude),
    lng: parseFloat(longitude),
    altitude_m: altitude ? parseFloat(altitude) : null,
    message: messageText || null,
    source: "zoleo",
    recorded_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
  });

  // Update device last polled
  await supabase.from("devices").update({ last_polled_at: new Date().toISOString() }).eq("id", device.id);

  return NextResponse.json({ ok: true });
}
