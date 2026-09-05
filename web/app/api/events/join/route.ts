import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/supabase/auth";

// GET /api/events/join?code=RIDE42
// Look up an event by join code without joining — returns name and rider_classes
// so the client can show the class picker before committing to join.
export async function GET(request: NextRequest) {
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, rider_classes")
    .eq("join_code", code)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Event not found. Check the code and try again." }, { status: 404 });
  if (event.status === "cancelled") return NextResponse.json({ error: "This event has been cancelled." }, { status: 410 });

  return NextResponse.json({
    id: event.id,
    name: event.name,
    status: event.status,
    rider_classes: event.rider_classes ?? [],
  });
}

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
    .select("id, name, status, organizer_id, paid, comped, seats_paid")
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

  // Capacity cap (already-joined riders are never blocked; handled above):
  //   • comped events  → unlimited (platform-sponsored)
  //   • paid events    → capped at seats_paid (60 base + $40/20-seat blocks)
  //   • free rides     → capped at 10 riders
  if (!event.comped) {
    const limit = event.paid ? (event.seats_paid ?? 60) : 10;
    const { count } = await supabase
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    if ((count ?? 0) >= limit) {
      const msg = event.paid
        ? `This event is full (${limit} seats). Ask the organizer to add more seats.`
        : "This ride has reached its 10-rider limit. Ask the organizer to upgrade it to a paid event.";
      return NextResponse.json({ error: msg, code: "cap_reached" }, { status: 402 });
    }
  }

  const displayName =
    body.display_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Rider";

  const riderClass = body.rider_class?.trim() || null;
  const riderNumber = body.rider_number?.trim() || null;

  const { error } = await supabase.from("event_participants").insert({
    event_id: event.id,
    user_id: user.id,
    display_name: displayName,
    role: "rider",
    rider_class: riderClass,
    rider_number: riderNumber,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ event_id: event.id, already_joined: false }, { status: 201 });
}
