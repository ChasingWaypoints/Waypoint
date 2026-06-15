import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

// GET /api/events/[id] — full event data with participants and their latest position
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch participants
  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role, gep_token, joined_at")
    .eq("event_id", id)
    .order("role", { ascending: true }); // organizer first

  // Find the current user's gep_token
  const me = (participants ?? []).find((p: any) => p.user_id === user.id);

  // For each participant, get their latest track point
  const enriched = await Promise.all(
    (participants ?? []).map(async (p: any) => {
      // Find their most recent active trip
      const { data: trip } = await supabase
        .from("trips")
        .select("id")
        .eq("user_id", p.user_id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!trip) {
        // Fall back to latest completed trip started in the last 24h
        const { data: recentTrip } = await supabase
          .from("trips")
          .select("id")
          .eq("user_id", p.user_id)
          .gte("started_at", new Date(Date.now() - 86400000).toISOString())
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!recentTrip) return { ...p, latest_point: null, gep_token: undefined };

        const { data: pt } = await supabase
          .from("track_points")
          .select("lat, lng, altitude_m, speed_kmh, recorded_at")
          .eq("trip_id", recentTrip.id)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return { ...p, latest_point: pt ?? null, gep_token: undefined };
      }

      const { data: pt } = await supabase
        .from("track_points")
        .select("lat, lng, altitude_m, speed_kmh, recorded_at")
        .eq("trip_id", trip.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { ...p, latest_point: pt ?? null, gep_token: undefined };
    })
  );

  const isOrganizer = event.organizer_id === user.id;

  return NextResponse.json({
    event,
    participants: enriched,
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
