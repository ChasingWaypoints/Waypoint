import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";
import { livekitConfig, removeFromRoom, UUID_RE } from "../../../../../lib/livekit";

// Organizer's radio settings for one event.
//   GET                                          -> codes + who has joined
//   POST { action: "toggle", enabled }           -> super admin only (for now)
//   POST { action: "regenerate", kind }          -> new staff/control code
//   POST { action: "revoke", member_id }         -> remove one person, kick them
// Authorization lives in the SQL functions (organizer or super admin).

function denied(message: string) {
  const status = /not authorized/i.test(message) ? 403 : 500;
  return NextResponse.json({ error: status === 403 ? "forbidden" : message }, { status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad_event" }, { status: 400 });
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("get_event_comms", { p_event_id: id });
  if (error) return denied(error.message);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad_event" }, { status: 400 });
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.action === "toggle") {
    const { data, error } = await supabase.rpc("set_event_comms", {
      p_event_id: id,
      p_enabled: body.enabled === true,
    });
    if (error) return denied(error.message);
    return NextResponse.json(data);
  }

  if (body.action === "regenerate") {
    if (body.kind !== "staff" && body.kind !== "control") {
      return NextResponse.json({ error: "bad_kind" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("regenerate_comms_code", {
      p_event_id: id,
      p_kind: body.kind,
    });
    if (error) return denied(error.message);
    return NextResponse.json({ code: data });
  }

  if (body.action === "revoke") {
    const memberId = String(body.member_id ?? "");
    if (!UUID_RE.test(memberId)) return NextResponse.json({ error: "bad_member" }, { status: 400 });
    const { data, error } = await supabase.rpc("revoke_radio_member", { p_member_id: memberId });
    if (error) return denied(error.message);
    if (data?.ok && data.room && data.identity) {
      const cfg = livekitConfig();
      if (cfg) await removeFromRoom(cfg, data.room, data.identity);
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
