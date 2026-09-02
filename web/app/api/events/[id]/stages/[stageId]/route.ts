import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";

async function requireOrganizer(request: NextRequest, eventId: string) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: event } = await supabase
    .from("events").select("id, organizer_id").eq("id", eventId).single();
  if (!event || event.organizer_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, supabase };
}

// POST — activate this stage (mirror its route onto the event)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const { id, stageId } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const { error } = await guard.supabase!.rpc("activate_event_stage", {
    p_event_id: id,
    p_stage_id: stageId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activated: stageId });
}

// DELETE — remove a stage
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const { id, stageId } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const { error } = await guard.supabase!
    .from("event_stages").delete().eq("id", stageId).eq("event_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
