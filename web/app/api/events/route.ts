import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../lib/supabase/auth";

// POST /api/events — create a new event (organizer)
export async function POST(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, starts_at } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // rider_classes: organizer-defined class options shown to riders on join
  const rider_classes: string[] = Array.isArray(body.rider_classes)
    ? body.rider_classes.map((c: string) => c.trim()).filter(Boolean)
    : [];

  // Generate a readable 6-char join code — retry on collision (extremely unlikely)
  let join_code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: existing } = await supabase
      .from("events").select("id").eq("join_code", candidate).maybeSingle();
    if (!existing) { join_code = candidate; break; }
  }
  if (!join_code) return NextResponse.json({ error: "Could not generate join code, try again" }, { status: 500 });

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organizer_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      starts_at: starts_at || null,
      join_code,
      rider_classes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-add organizer as a participant
  const orgName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Organizer";
  await supabase.from("event_participants").insert({
    event_id: event.id,
    user_id: user.id,
    display_name: orgName,
    role: "organizer",
  });

  return NextResponse.json(event, { status: 201 });
}

// GET /api/events — list events for current user
export async function GET(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("event_participants")
    .select("role, joined_at, events(id, name, status, join_code, share_token, starts_at, organizer_id, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data ?? []).map((row: any) => ({
    ...row.events,
    my_role: row.role,
    joined_at: row.joined_at,
  }));

  return NextResponse.json(events);
}
