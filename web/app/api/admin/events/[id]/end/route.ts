import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";

// POST /api/admin/events/[id]/end — super-admin end (force-complete) of any
// event. Marks it 'completed' and closes the window now, which immediately
// revokes command / GEP recovery access (025_command_expiry).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("end_event", { p_event_id: id });
  if (error) {
    if (error.code === "42501" || /not authorized/i.test(error.message)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: "completed" });
}
