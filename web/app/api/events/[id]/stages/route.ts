import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";

async function requireOrganizer(request: NextRequest, eventId: string) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: event } = await supabase
    .from("events").select("id, organizer_id, active_stage_id").eq("id", eventId).single();
  if (!event || event.organizer_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, supabase, event };
}

// GET — list stages for an event (+ which is active)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.supabase!
    .from("event_stages")
    .select("id, name, position, color, visible, created_at")
    .eq("event_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stages: data ?? [], active_stage_id: guard.event!.active_stage_id ?? null });
}

// POST — add a stage (multipart: file + name, or JSON { gpx, name })
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOrganizer(request, id);
  if ("error" in guard) return guard.error;

  let gpx = "";
  let name = "";
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      return NextResponse.json({ error: "File must be a .gpx file" }, { status: 400 });
    }
    if (file.size > 10_000_000) {
      return NextResponse.json({ error: "File too large (10 MB max)" }, { status: 400 });
    }
    gpx = await file.text();
    name = ((form.get("name") as string) || file.name.replace(/\.gpx$/i, "")).trim();
  } else {
    const body = await request.json();
    gpx = body.gpx ?? "";
    name = (body.name ?? "").trim();
  }

  if (!gpx.includes("<gpx")) {
    return NextResponse.json({ error: "That doesn't look like a valid GPX file" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Give the stage a name" }, { status: 400 });

  // next position = current count
  const { count } = await guard.supabase!
    .from("event_stages").select("*", { count: "exact", head: true }).eq("event_id", id);

  const { data, error } = await guard.supabase!
    .from("event_stages")
    .insert({ event_id: id, name, route_gpx: gpx, position: count ?? 0 })
    .select("id, name, position, color, visible, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If this is the first stage, make it active automatically.
  if ((count ?? 0) === 0) {
    await guard.supabase!.rpc("activate_event_stage", { p_event_id: id, p_stage_id: data.id });
  }

  return NextResponse.json({ stage: data }, { status: 201 });
}
