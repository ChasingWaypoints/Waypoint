import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";

// GET /api/command/[token] — the credentialed Command View feed (positions +
// SOS + ICE), resolved from a command/participant GEP token. No login.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_command_by_token", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Invalid or expired command link" }, { status: 404 });
  return NextResponse.json(data);
}
