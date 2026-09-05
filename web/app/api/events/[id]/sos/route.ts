import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";

// POST /api/events/[id]/sos { participant_id } — organizer/super acknowledges
// (clears) an SOS. The RPC enforces authorization.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body.participant_id) return NextResponse.json({ error: "participant_id required" }, { status: 400 });

  const { error } = await supabase.rpc("clear_participant_sos", { p_participant_id: body.participant_id });
  if (error) {
    if (error.code === "42501" || /not authorized/i.test(error.message))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
