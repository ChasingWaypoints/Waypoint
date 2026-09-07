import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";

// POST /api/admin/events/[id]/delete — super-admin hard-delete of any event.
// The delete_event RPC is SECURITY DEFINER and permits the event's organizer or
// a super admin; here the caller is a super admin. Cascades remove all data.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("delete_event", { p_event_id: id });
  if (error) {
    if (error.code === "42501" || /not authorized/i.test(error.message)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: true });
}
