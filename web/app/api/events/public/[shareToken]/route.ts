import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../../lib/supabase/admin";

// GET /api/events/public/[shareToken]
// Public endpoint — no auth required. Returns event + all riders' latest positions.
// Used by the /event/[token] spectator page.
// All queries use SECURITY DEFINER RPCs — no SUPABASE_SERVICE_ROLE_KEY needed.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await params;
  const supabase = createAnonClient();

  // Get event by share token
  const { data: event, error: eventError } = await supabase.rpc(
    "get_public_event",
    { p_share_token: shareToken }
  );

  if (eventError || !event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get all participants
  const { data: participants } = await supabase.rpc(
    "get_event_participants_for_gep",
    { p_event_id: event.id }
  );

  // Enrich with each rider's latest position and recent track
  const riders = await Promise.all(
    (participants ?? []).map(async (p: { id: string; user_id: string; display_name: string; role: string }) => {
      const { data: points } = await supabase.rpc("get_rider_track", {
        p_user_id:    p.user_id,
        p_max_points: 500,
      });

      const track = (points ?? []) as { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }[];
      const latest = track.length ? track[track.length - 1] : null;

      return { ...p, latest, track };
    })
  );

  return NextResponse.json({ event, riders });
}
