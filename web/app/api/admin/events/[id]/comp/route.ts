import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../../lib/supabase/auth";

// POST /api/admin/events/[id]/comp — super-admin comp override (sponsor/waive).
// Body: { comped: boolean, reason?: string }. The RPC enforces super-admin.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { error } = await supabase.rpc("admin_set_event_comped", {
    p_event_id: id,
    p_comped: !!body.comped,
    p_reason: body.reason ? String(body.reason).slice(0, 200) : null,
  });
  if (error) {
    if (error.code === "42501" || /not authorized/i.test(error.message)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, comped: !!body.comped });
}
