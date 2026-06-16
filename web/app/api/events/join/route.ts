import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";

// POST /api/events/join — look up event by join code and join in one step
// Body: { code: "RIDE42", display_name?: "Victor" }
export async function POST(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const code = body.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Join code is required" }, { status: 400 });

  // Look up event by join code
  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, organizer_id")
    .eq("join_code", code)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found. Check the code and try again." }, { status: 404 });
  if (event.status === "cancelled") return NextResponse.json({ error: "This event has been cancelled." }, { status: 410 });

  // Check if already a participant
  const { data: existing } = await supabase
    .from("event_participants")
    .select("id, event_id")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Already joined — return the event ID so the app can navigate there
    return NextResponse.json({ event_id: event.id, already_joined: true });
  }

  const displayName =
    body.display_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Rider";

  const { error } = await supabase.from("event_participants").insert({
    event_id: event.id,
    user_id: user.id,
    display_name: displayName,
    role: "rider",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ event_id: event.id, already_joined: false }, { status: 201 });
}
