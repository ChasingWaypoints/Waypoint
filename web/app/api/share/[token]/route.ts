import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Public anon client — no cookie/session handling needed for share links
function getPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/share/[token] — public, no auth required
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
  const { token } = await params;
  const password = request.nextUrl.searchParams.get("password");
  const supabase = getPublicClient();

  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, name, status, is_public, share_token, share_password_hash, share_expires_at, started_at, ended_at, created_at")
    .eq("share_token", token)
    .eq("is_public", true)
    .is("deleted_at", null)
    .single();

  if (error || !trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Check expiry
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date()) {
    return NextResponse.json({ error: "This share link has expired" }, { status: 410 });
  }

  // Check password
  if (trip.share_password_hash) {
    if (!password) return NextResponse.json({ error: "password_required" }, { status: 401 });
    if (password !== trip.share_password_hash) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
  }

  // Get track points (apply privacy zone masking in future)
  const { data: points } = await supabase
    .from("track_points")
    .select("lat, lng, altitude_m, speed_kmh, recorded_at, source")
    .eq("trip_id", trip.id)
    .order("recorded_at", { ascending: true });

  // Compute basic stats
  let distance = 0;
  if (points && points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      distance += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
  }

  return NextResponse.json({
    trip: {
      id: trip.id,
      name: trip.name,
      status: trip.status,
      started_at: trip.started_at,
      ended_at: trip.ended_at,
      share_token: trip.share_token,
    },
    points: points ?? [],
    stats: {
      point_count: points?.length ?? 0,
      distance_km: Math.round(distance * 10) / 10,
      duration_minutes: trip.started_at && trip.ended_at
        ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
        : null,
    },
  });
  } catch (err) {
    console.error("[share/token] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
