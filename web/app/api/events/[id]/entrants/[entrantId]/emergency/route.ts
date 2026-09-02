import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../../lib/supabase/auth";

// GET /api/events/[id]/entrants/[entrantId]/emergency
//
// Emergency/SAR details for a linked entrant. The RPC itself enforces
// that the caller is the event's organizer, so this is never exposed to
// spectators even though the live map is public.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entrantId: string }> }
) {
  const { entrantId } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("get_participant_emergency", {
    p_participant_id: entrantId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const d = (data ?? {}) as Record<string, unknown>;
  if (d.error === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (d.error === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(d);
}
