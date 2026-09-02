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

// PATCH — toggle visibility or set colour
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const { id, stageId } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  let body: { visible?: boolean; color?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (typeof body.visible === "boolean") patch.visible = body.visible;
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await guard.supabase!
    .from("event_stages").update(patch).eq("id", stageId).eq("event_id", id)
    .select("id, name, color, visible").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stage: data });
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
