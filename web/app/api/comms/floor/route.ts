import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";
import { livekitConfig, muteSpeakers, UUID_RE } from "../../../../lib/livekit";

// POST /api/comms/floor
//   { token, action: "request", channel_id, priority?, lat?, lng? }
//   { token, action: "release", transmission_id }
//
// Half-duplex like a radio: one speaker per channel. Postgres (request_floor)
// is the referee; the client unmutes its mic only after { granted: true }.
// When race control's all-call pre-empts other speakers, this route mutes
// them in LiveKit so the room matches what Postgres decided.
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

  if (body.action === "release") {
    const tx = String(body.transmission_id ?? "");
    if (!UUID_RE.test(tx)) {
      return NextResponse.json({ error: "bad_transmission_id" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("release_floor", {
      p_token: token,
      p_transmission_id: tx,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action !== "request") {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  const channel = String(body.channel_id ?? "");
  if (!UUID_RE.test(channel)) {
    return NextResponse.json({ error: "bad_channel_id" }, { status: 400 });
  }
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

  const { data, error } = await supabase.rpc("request_floor", {
    p_token: token,
    p_channel_id: channel,
    p_priority: body.priority === true,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) {
    const status = data?.error === "invalid_token" ? 401 : 403;
    return NextResponse.json(data, { status });
  }

  const mute: { identity: string; channel_id: string }[] = data.mute ?? [];
  if (data.granted && mute.length) {
    const cfg = livekitConfig();
    if (cfg) await muteSpeakers(cfg, data.room, mute);
  }

  // The client never needs the mute list.
  return NextResponse.json({
    ok: true,
    granted: data.granted,
    reason: data.reason ?? null,
    holder: data.holder ?? null,
    transmission_id: data.transmission_id ?? null,
    expires_at: data.expires_at ?? null,
  });
}
