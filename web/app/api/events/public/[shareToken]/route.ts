import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// GET /api/events/public/[shareToken]
// Public endpoint — no auth. Returns event + all riders' latest positions.
// Used by the /event/[token] spectator page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await params;
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, route_gpx, route_name, starts_at, created_at")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role")
    .eq("event_id", event.id)
    .order("role");

  // Enrich with each rider's latest position and recent track
  const riders = await Promise.all(
    (participants ?? []).map(async (p: any) => {
      let tripId: string | null = null;

      const { data: activeTrip } = await supabase
        .from("trips")
        .select("id")
        .eq("user_id", p.user_id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeTrip) {
        tripId = activeTrip.id;
      } else {
        const { data: recentTrip } = await supabase
          .from("trips")
          .select("id")
          .eq("user_id", p.user_id)
          .gte("started_at", new Date(Date.now() - 86400000).toISOString())
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentTrip) tripId = recentTrip.id;
      }

      if (!tripId) return { ...p, latest: null, track: [] };

      const { data: points } = await supabase
        .from("track_points")
        .select("lat, lng, altitude_m, speed_kmh, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true });

      const track = points ?? [];
      const latest = track.length ? track[track.length - 1] : null;

      return { ...p, latest, track };
    })
  );

  return NextResponse.json({ event, riders });
}
