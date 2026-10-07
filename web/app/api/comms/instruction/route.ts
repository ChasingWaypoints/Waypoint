import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";
import { UUID_RE } from "../../../../lib/livekit";

// Race control's latest standing all-call, for the reconnect banner.
//   POST { token }                                   -> current instruction
//   POST { token, action: "clear", transmission_id } -> race control withdraws it
// POST (not GET) so device tokens never land in URLs or access logs.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 8) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const supabase = createAnonClient();

  if (body.action === "clear") {
    const tx = String(body.transmission_id ?? "");
    if (!UUID_RE.test(tx)) {
      return NextResponse.json({ error: "bad_transmission_id" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("clear_instruction", {
      p_token: token,
      p_transmission_id: tx,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: data?.ok ? 200 : 403 });
  }

  const { data, error } = await supabase.rpc("current_instruction", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: data?.ok ? 200 : 401 });
}
