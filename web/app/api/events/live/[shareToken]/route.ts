import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../../lib/supabase/admin";

/**
 * GET /api/events/live/[shareToken]
 *
 * Public live positions for an event, addressed by its share token.
 * Backs both the embeddable map and the organizer's live view.
 *
 * Returns only spectator-safe fields — the underlying RPC never selects
 * feed URLs, feed passwords, or GEP tokens.
 *
 * ?track=<participantId> additionally returns that entrant's breadcrumb
 * trail, so clicking a marker doesn't need a second round trip.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await params;
  const supabase = createAnonClient();

  const { data, error } = await supabase.rpc("get_event_live_positions", {
    p_share_token: shareToken,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const trackFor = request.nextUrl.searchParams.get("track");
  let track: { lat: number; lng: number; recorded_at: string }[] | undefined;

  if (trackFor) {
    const { data: pts } = await supabase.rpc("get_event_entrant_track", {
      p_share_token: shareToken,
      p_participant_id: trackFor,
      p_max_points: 500,
    });
    // RPC returns newest first; the map wants oldest first to draw a line
    track = ((pts ?? []) as typeof track)!.slice().reverse();
  }

  return NextResponse.json(
    { ...data, track },
    {
      headers: {
        // Positions refresh every ~2 min; a short edge cache absorbs a
        // spectator crowd without making the map feel stale.
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      },
    }
  );
}
