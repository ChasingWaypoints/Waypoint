import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";
import { rowToEntrant, CSV_COLUMNS, waypointCodeFromRow } from "../../../../../../lib/entrants";

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

  // Fetch the current row so a partial edit (e.g. just the name) does
  // not wipe the fields the body left out. We merge the provided fields
  // over the existing values, then re-run the importer's normalisation.
  const { data: cur } = await guard.supabase!
    .from("event_participants")
    .select("display_name, rider_number, rider_class, device_type, feed_url, feed_id, feed_password, notes")
    .eq("id", entrantId)
    .eq("event_id", id)
    .single();
  if (!cur) {
    return NextResponse.json({ error: "Entrant not found" }, { status: 404 });
  }
  const c = cur as Record<string, string | null>;

  const fromBody = (aliases: string[]): string | undefined => {
    for (const k of Object.keys(body)) {
      if (aliases.includes(k.toLowerCase())) return body[k];
    }
    return undefined;
  };
  const feedProvided = fromBody(CSV_COLUMNS.feed) !== undefined;

  const merged: Record<string, string> = {
    name: fromBody(CSV_COLUMNS.name) ?? c.display_name ?? "",
    number: fromBody(CSV_COLUMNS.number) ?? c.rider_number ?? "",
    class: fromBody(CSV_COLUMNS.class) ?? c.rider_class ?? "",
    device: fromBody(CSV_COLUMNS.device) ?? c.device_type ?? "",
    feed: feedProvided ? (fromBody(CSV_COLUMNS.feed) ?? "") : (c.feed_url || c.feed_id || ""),
    password: fromBody(CSV_COLUMNS.password) ?? c.feed_password ?? "",
    notes: fromBody(CSV_COLUMNS.notes) ?? c.notes ?? "",
  };

  const result = rowToEntrant(merged, 1);
  if ("error" in result) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  // If a Waypoint code was provided in this edit, (re)resolve the link.
  const updatePayload: Record<string, unknown> = {
    ...result.entrant,
    poll_error: null,
  };
  const code = waypointCodeFromRow(body);
  if (code !== null) {
    const { data: uid } = await guard.supabase!.rpc("resolve_waypoint_id", { p_code: code });
    updatePayload.user_id = (uid as string | null) ?? null;
  }

  const { data, error } = await guard.supabase!
    .from("event_participants")
    .update(updatePayload)
    .eq("id", entrantId)
    .eq("event_id", id)
    .select("id, display_name, rider_number, rider_class, device_type, feed_url, feed_id")
    .single();

  if (error) {
    if (error.code === "23505" || /ep_unique_event_user|duplicate key/i.test(error.message)) {
      return NextResponse.json(
        { error: "That Waypoint account is already linked to another entry in this event." },
        { status: 409 }
      );
    }
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
