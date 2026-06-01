import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// GET /api/trips/[id]/location
// Returns the most recent location for a trip with smart source fallback:
// 1. Phone GPS if pinged within stale_threshold_minutes (default 5)
// 2. Satellite device (Garmin/SPOT/ZOLEO) otherwise
// This ensures the map always shows the freshest position regardless of source

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const staleMinutes = parseInt(request.nextUrl.searchParams.get("stale") ?? "5");
  const staleThreshold = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();

  const supabase = await createClient();

  // Get the two most recent points by source priority
  const { data: points } = await supabase
    .from("track_points")
    .select("id, lat, lng, altitude_m, speed_kmh, source, recorded_at")
    .eq("trip_id", id)
    .order("recorded_at", { ascending: false })
    .limit(20);

  if (!points?.length) {
    return NextResponse.json({ location: null, source: null });
  }

  // Find most recent phone ping
  const phonePoint = points.find((p) => p.source === "phone");
  // Find most recent satellite ping
  const satellitePoint = points.find((p) => p.source !== "phone");

  let active = null;
  let fallback = false;

  if (phonePoint && phonePoint.recorded_at > staleThreshold) {
    // Phone GPS is fresh — use it
    active = phonePoint;
  } else if (satellitePoint) {
    // Phone GPS is stale or absent — fall back to satellite
    active = satellitePoint;
    fallback = true;
  } else if (phonePoint) {
    // Only phone available (stale)
    active = phonePoint;
    fallback = true;
  }

  return NextResponse.json({
    location: active,
    source: active?.source ?? null,
    fallback,
    phone_last_seen: phonePoint?.recorded_at ?? null,
    satellite_last_seen: satellitePoint?.recorded_at ?? null,
  });
}
