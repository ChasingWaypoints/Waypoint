import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/network-link.kml
//
// Credentialed GEP NetworkLink — one per participant.
// The gepToken is unique to each rider, so if this URL leaks, the
// organizer can look at gep_access_log and trace it back to who shared it.
//
// Usage: download this file once and open it in Google Earth Pro.
// GEP will auto-refresh the track KML every 30 seconds.

const REFRESH_SECONDS = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gepToken: string }> }
) {
  const { id, gepToken } = await params;
  const supabase = createAdminClient();

  // Validate gep token and confirm it belongs to this event
  const { data: participant } = await supabase
    .from("event_participants")
    .select("id, display_name, role, event_id, events(id, name, status, organizer_id)")
    .eq("gep_token", gepToken)
    .eq("event_id", id)
    .maybeSingle();

  if (!participant) return new NextResponse("Invalid or expired GEP token", { status: 401 });

  const event = (participant as any).events;
  if (!event) return new NextResponse("Event not found", { status: 404 });

  // Log the access — IP + user agent for traceability
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ua = request.headers.get("user-agent") || "unknown";

  await supabase.from("gep_access_log").insert({
    participant_id: participant.id,
    event_id: id,
    ip_address: ip,
    user_agent: ua,
  });

  const origin = request.nextUrl.origin;
  const trackUrl = `${origin}/api/events/${id}/gep/${gepToken}/track.kml`;
  const isLive = event.status === "active";

  const refreshBlock = isLive
    ? `<refreshMode>onInterval</refreshMode>\n      <refreshInterval>${REFRESH_SECONDS}</refreshInterval>`
    : `<refreshMode>onExpire</refreshMode>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>${event.name}${isLive ? " 🔴 LIVE" : ""} — Waypoint (${participant.display_name})</name>
    <description>${
      isLive
        ? `Live group GPS feed — ${event.name}. Auto-refreshes every ${REFRESH_SECONDS}s.\nPersonalised link for: ${participant.display_name}. Do not share this URL.`
        : `Completed event: ${event.name}.\nPersonalised link for: ${participant.display_name}.`
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
