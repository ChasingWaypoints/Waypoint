import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";

// GET /api/ice/[token]
//
// Public ICE (In Case of Emergency) card, addressed by an unguessable
// token the rider chooses to share. Returns only the emergency fields.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAnonClient();

  const { data, error } = await supabase.rpc("get_ice_card", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
