import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";

// GET /api/events/[id]/command — organizer/super command feed: positions plus
// SOS state and ICE. Never the public feed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("get_command_for_event", { p_event_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && (data as { error?: string }).error === "forbidden")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data ?? {});
}
