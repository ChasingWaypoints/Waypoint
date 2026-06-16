import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";

// GET /api/events/[id] — full event data with riders and their tracks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOrganizer = event.organizer_id === user.id;

  // Fetch participants (keep gep_token in memory so we can expose it to organizer)
  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role, gep_token, joined_at")
    .eq("event_id", id)
    .order("role", { ascending: true }); // organizer first

  // Find the current user's gep_token
  const me = (participants ?? []).find((p: any) => p.user_id === user.id);

  // For each participant, fetch their track from their most recent active/recent trip.
  // Returns { id, user_id, display_name, role, joined_at, latest, track, gep_token? }
  // gep_token is only included when the requester is the organizer.
  const riders = await Promise.all(
    (participants ?? []).map(async (p: any) => {
      const { gep_token, ...rest } = p;

      // Prefer an active trip; fall back to any trip started in the last 24h
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
        tripId = recentTrip?.id ?? null;
      }

      if (!tripId) {
        return {
          ...rest,
          latest: null,
          track: [],
          ...(isOrganizer ? { gep_token } : {}),
        };
      }

      // Fetch up to 500 track points (chronological) so the map can draw the polyline
      const { data: trackPoints } = await supabase
        .from("track_points")
        .select("lat, lng, altitude_m, speed_kmh, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true })
        .limit(500);

      const pts = trackPoints ?? [];
      const latest = pts.length > 0 ? pts[pts.length - 1] : null;

      return {
        ...rest,
        latest,
        track: pts,
        ...(isOrganizer ? { gep_token } : {}),
      };
    })
  );

  return NextResponse.json({
    event,
    riders,
    my_gep_token: me?.gep_token ?? null,
    is_organizer: isOrganizer,
  });
}

// PATCH /api/events/[id] — update event (organizer only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase.from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowed = ["name", "description", "status", "starts_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
