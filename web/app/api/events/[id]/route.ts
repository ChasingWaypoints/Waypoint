import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";
import { createAnonClient } from "../../../../lib/supabase/admin";

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

  // Fetch participants via the user's own supabase client (RLS enforced — correct)
  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role, gep_token, joined_at, rider_class, rider_number")
    .eq("event_id", id)
    .order("role", { ascending: true }); // organizer first

  // Find the current user's gep_token
  const me = (participants ?? []).find((p: any) => p.user_id === user.id);

  // For each participant, fetch their track via the get_rider_track() SECURITY DEFINER
  // RPC — this lets us read any user's trips/track_points without the service role key.
  const anonSupabase = createAnonClient();
  const riders = await Promise.all(
    (participants ?? []).map(async (p: any) => {
      const { gep_token, rider_class, rider_number, ...rest } = p;

      const { data: points } = await anonSupabase.rpc("get_rider_track", {
        p_user_id:    p.user_id,
        p_max_points: 500,
      });

      const pts = (points ?? []) as { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }[];
      const latest = pts.length > 0 ? pts[pts.length - 1] : null;

      return {
        ...rest,
        rider_class: rider_class ?? null,
        rider_number: rider_number ?? null,
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
  // rider_classes is a text[] — validate separately
  if ("rider_classes" in body) {
    updates.rider_classes = Array.isArray(body.rider_classes)
      ? body.rider_classes.map((c: string) => String(c).trim()).filter(Boolean)
      : [];
  }

  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
