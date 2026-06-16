import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep-credentials
// Returns all named GEP viewer credentials for this event — organizer only.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("event_gep_credentials")
    .select("id, display_name, gep_token, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/events/[id]/gep-credentials
// Create a new named GEP credential.
// Body: { display_name: "Darren Smith" }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events").select("organizer_id").eq("id", id).single();
  if (!event || event.organizer_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const displayName = body.display_name?.trim();
  if (!displayName) return NextResponse.json({ error: "display_name is required" }, { status: 400 });

  // Use admin client so the insert bypasses RLS (service role auto-generates gep_token via default)
  const admin = createAdminClient();
  const { data: cred, error } = await admin
    .from("event_gep_credentials")
    .insert({ event_id: id, display_name: displayName })
    .select("id, display_name, gep_token, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(cred, { status: 201 });
}
