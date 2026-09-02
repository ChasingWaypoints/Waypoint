import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";
import { rowToEntrant, EntrantInput, waypointCodeFromRow } from "../../../../../lib/entrants";

// Shared organizer guard for every entrant route.
export async function requireOrganizer(request: NextRequest, eventId: string) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", eventId)
    .single();

  if (!event || event.organizer_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, supabase };
}

// ── GET /api/events/[id]/entrants ─────────────────────────────
// Organizer roster with live status. Includes feed config so the
// organizer can fix a bad link; never exposed to spectators.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.supabase!
    .from("event_participants")
    .select(
      "id, display_name, rider_number, rider_class, device_type, feed_url, feed_id, " +
        "last_lat, last_lng, last_seen_at, last_polled_at, poll_error, gep_token, notes"
    )
    .eq("event_id", id)
    .order("rider_number", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  // The Supabase client has no generated types in this project, so the
  // row shape comes from the select above rather than inference.
  const rows = (data ?? []) as unknown as Record<string, unknown> &
    { last_seen_at: string | null }[];

  const entrants = rows.map((e) => {
    const seen = e.last_seen_at ? new Date(e.last_seen_at).getTime() : null;
    const minutes = seen === null ? null : Math.floor((now - seen) / 60000);

    // Beacons report every few minutes at best; these thresholds are
    // deliberately generous so a normal gap doesn't read as a problem.
    let status: "live" | "stale" | "dark" | "no_fix";
    if (minutes === null) status = "no_fix";
    else if (minutes <= 15) status = "live";
    else if (minutes <= 60) status = "stale";
    else status = "dark";

    return { ...e, minutes_since_fix: minutes, status };
  });

  return NextResponse.json({ entrants, count: entrants.length });
}

// ── POST /api/events/[id]/entrants ────────────────────────────
// Adds a single entrant. Body is one row in the CSV shape, so the
// dashboard form and the CSV importer share validation exactly.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = rowToEntrant(body, 1);
  if ("error" in result) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  // Link to a Waypoint account if the organizer supplied a code.
  let linkedUserId: string | null = null;
  const code = waypointCodeFromRow(body);
  if (code) {
    const { data: uid } = await guard.supabase!.rpc("resolve_waypoint_id", { p_code: code });
    linkedUserId = (uid as string | null) ?? null;
  }

  const row: EntrantInput & { event_id: string; user_id: string | null } = {
    ...result.entrant,
    event_id: id,
    user_id: linkedUserId,
  };

  const { data, error } = await guard.supabase!
    .from("event_participants")
    .insert(row)
    .select("id, display_name, rider_number, rider_class, device_type, gep_token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entrant: data }, { status: 201 });
}
