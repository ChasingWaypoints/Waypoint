import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";
import { rowToEntrant } from "../../../../../../lib/entrants";

async function requireOrganizer(request: NextRequest, eventId: string) {
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

// ── PATCH — edit one entrant (fix a bad feed link, change class) ──
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entrantId: string }> }
) {
  const { id, entrantId } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Re-run the same normalisation the importer uses so an edited
  // Garmin link gets cleaned up the same way.
  const result = rowToEntrant(body, 1);
  if ("error" in result) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const { data, error } = await guard.supabase!
    .from("event_participants")
    .update({
      ...result.entrant,
      // changing the feed invalidates the previous error
      poll_error: null,
    })
    .eq("id", entrantId)
    .eq("event_id", id)
    .select("id, display_name, rider_number, rider_class, device_type, feed_url, feed_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Entrant not found" }, { status: 404 });
  }

  return NextResponse.json({ entrant: data });
}

// ── DELETE — remove an entrant from the roster ────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entrantId: string }> }
) {
  const { id, entrantId } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const { error } = await guard.supabase!
    .from("event_participants")
    .delete()
    .eq("id", entrantId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
