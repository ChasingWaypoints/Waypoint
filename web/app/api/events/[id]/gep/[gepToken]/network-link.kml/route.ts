import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/network-link.kml
//
// Credentialed GEP NetworkLink. The gepToken is either:
//   • A participant token (from event_participants.gep_token) — app riders
//   • A named credential token (from event_gep_credentials.gep_token) — external viewers
//
// Either way: if this URL leaks, the organizer can trace it via gep_access_log.
// Usage: in Google Earth Pro, go to Add → Network Link → paste this URL in the Link field.
// GEP auto-refreshes the track KML every 30 seconds while the event is active.

const REFRESH_SECONDS = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gepToken: string }> }
) {
  const { id, gepToken } = await params;
  const supabase = createAdminClient();

  // ── Validate token ────────────────────────────────────────────
  // Check participant tokens first, then named credentials.
  let holderName = "";
  let logInsert: Record<string, unknown> = { event_id: id };

  const { data: participant } = await supabase
    .from("event_participants")
    .select("id, display_name, event_id")
    .eq("gep_token", gepToken)
    .eq("event_id", id)
    .maybeSingle();

  if (participant) {
    holderName = participant.display_name;
    logInsert.participant_id = participant.id;
  } else {
    const { data: credential } = await supabase
      .from("event_gep_credentials")
      .select("id, display_name, event_id")
      .eq("gep_token", gepToken)
      .eq("event_id", id)
      .maybeSingle();

    if (!credential) return new NextResponse("Invalid or expired GEP token", { status: 401 });
    holderName = credential.display_name;
    logInsert.credential_id = credential.id;
  }

  // ── Load event info ───────────────────────────────────────────
  const { data: event } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (!event) return new NextResponse("Event not found", { status: 404 });

  // ── Log the access ────────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  await supabase.from("gep_access_log").insert({
    ...logInsert,
    ip_address: ip,
    user_agent: request.headers.get("user-agent") || "unknown",
  });

  // ── Build KML ─────────────────────────────────────────────────
  const origin = request.nextUrl.origin;
  const trackUrl = `${origin}/api/events/${id}/gep/${gepToken}/track.kml`;
  const isLive = event.status === "active";

  const refreshBlock = isLive
    ? `<refreshMode>onInterval</refreshMode>\n      <refreshInterval>${REFRESH_SECONDS}</refreshInterval>`
    : `<refreshMode>onExpire</refreshMode>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>${event.name}${isLive ? " 🔴 LIVE" : ""} — Waypoint (${holderName})</name>
    <description>${
      isLive
        ? `Live group GPS feed — ${event.name}. Auto-refreshes every ${REFRESH_SECONDS}s.\nPersonalised link for: ${holderName}. Do not share this URL.`
        : `Completed event: ${event.name}.\nPersonalised link for: ${holderName}.`
    }</description>
    <visibility>1</visibility>
    <open>1</open>
    <flyToView>1</flyToView>
    <Link>
      <href>${trackUrl}</href>
      ${refreshBlock}
      <viewRefreshMode>never</viewRefreshMode>
    </Link>
  </NetworkLink>
</kml>`;

  const safeName = event.name.replace(/[^a-z0-9]/gi, "_");
  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="waypoint-event-${safeName}.kml"`,
      "Cache-Control": "no-cache",
    },
  });
}
