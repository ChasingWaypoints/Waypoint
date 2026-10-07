import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";

// POST /api/comms/redeem  { code, name }
//
// A marshal, sweep rider or medic enters the event's staff code (or race
// control's control code) plus their name and gets their own radio token.
// One shared code for the organizer to hand out; one identity per person.
// The token only works for comms — never for the Command View map.
export async function POST(request: NextRequest) {
  let body: { code?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const name = typeof body.name === "string" ? body.name : "";

  const { data, error } = await createAnonClient().rpc("comms_redeem_code", {
    p_code: code,
    p_name: name,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) {
    const status = data?.error === "unknown_code" ? 404 : data?.error?.startsWith("bad_") ? 400 : 403;
    return NextResponse.json({ error: data?.error ?? "denied" }, { status });
  }
  return NextResponse.json({
    token: data.token,
    event_id: data.event_id,
    event_name: data.event_name,
    role: data.role,
    label: data.label,
  });
}
