import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/network-link.kml
//
// Credentialed GEP NetworkLink. The gepToken is either:
//   • A participant token (from event_participants.gep_token) — app riders
//   • A named credential token (from event_gep_credentials.gep_token) — external viewers
//
// Token validation + event lookup are handled by the validate_gep_token()
// SECURITY DEFINER function — no SUPABASE_SERVICE_ROLE_KEY needed.

const REFRESH_SECONDS = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gepToken: string }> }
) {
  const { id, gepToken } = await params;
  const supabase = createAnonClient();

  // ── Validate token (also returns event name/status) ───────────
  const { data: tokenData, error: tokenError } = await supabase.rpc(
    "validate_gep_token",
    { p_event_id: id, p_token: gepToken }
  );

  if (tokenError || !tokenData) {
    return new NextResponse("Invalid or expired GEP token", { status: 401 });
  }

  const holderName: string = tokenData.holder_name;
  const participantId: string | null = tokenData.participant_id ?? null;
  const credentialId: string | null = tokenData.credential_id ?? null;
  const event: { name: string; status: string } = tokenData.event;

  // ── Log the access ────────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  await supabase.rpc("log_gep_access", {
    p_event_id:       id,
    p_participant_id: participantId,
    p_credential_id:  credentialId,
    p_ip:             ip,
    p_user_agent:     request.headers.get("user-agent") || "unknown",
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
