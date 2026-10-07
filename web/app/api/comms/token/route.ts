import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";
import { livekitConfig, mintToken } from "../../../../lib/livekit";

// POST /api/comms/token  { token }
//
// Exchanges a phone's beacon device token, or a command-link credential, for
// a LiveKit token to the event's live-audio room. No Waypoint login: the same
// two credentials the tracking map already trusts. comms_join decides which
// channels this person may hear and talk on; they ride in the token metadata
// so the client can subscribe to just those tracks.
export async function POST(request: NextRequest) {
  const cfg = livekitConfig();
  if (!cfg) {
    return NextResponse.json({ error: "comms_not_configured" }, { status: 503 });
  }

  let body: { token?: string };
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
  const { data, error } = await supabase.rpc("comms_join", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) {
    const status = data?.error === "invalid_token" ? 401 : 403;
    return NextResponse.json({ error: data?.error ?? "denied" }, { status });
  }

  const name = data.number ? `#${data.number} ${data.label}` : data.label;
  const jwt = await mintToken(cfg, {
    identity: data.identity,
    name,
    room: data.room,
    metadata: JSON.stringify({
      role: data.role,
      number: data.number ?? null,
      channels: (data.channels ?? []).map((c: { id: string; can_talk: boolean }) => ({
        id: c.id,
        can_talk: c.can_talk,
      })),
    }),
  });

  return NextResponse.json({
    url: cfg.url,
    token: jwt,
    room: data.room,
    identity: data.identity,
    label: name,
    role: data.role,
    event_id: data.event_id,
    event_name: data.event_name,
    channels: data.channels,
  });
}
