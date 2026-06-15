import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// GET /api/share/[token]/network-link.kml
//
// Returns a KML NetworkLink document that Google Earth Pro can open and subscribe to.
// GEP will auto-refresh the track.kml feed on the specified interval, showing live position.
//
// Usage:
//   1. Copy this URL and open it in Google Earth Pro (File → Open → paste URL, or drag .kml)
//   2. GEP will fetch the live track every REFRESH_SECONDS seconds
//   3. Works for both active (live) and completed trips
//
// The link is auth'd only by the share token — no login required.
const REFRESH_SECONDS = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  // Verify the token is valid and the trip is public
  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, status")
    .eq("share_token", token)
    .eq("is_public", true)
    .single();

  if (!trip) return new NextResponse("Not found", { status: 404 });

  // Derive the base URL from the request so this works in dev + prod
  const origin = request.nextUrl.origin;
  const trackKmlUrl = `${origin}/api/share/${token}/track.kml`;

  const isLive = trip.status === "active";

  // For completed trips, use onStop (no auto-refresh needed)
  // For active trips, poll on interval
  const refreshBlock = isLive
    ? `<refreshMode>onInterval</refreshMode>
      <refreshInterval>${REFRESH_SECONDS}</refreshInterval>`
    : `<refreshMode>onExpire</refreshMode>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <NetworkLink>
    <name>${trip.name}${isLive ? " 🔴 LIVE" : ""} — Waypoint</name>
    <description>${
      isLive
        ? `Live GPS feed. Auto-refreshes every ${REFRESH_SECONDS} seconds in Google Earth Pro.`
        : "Completed trip track from Waypoint."
    }</description>
    <visibility>1</visibility>
    <open>1</open>
    <refreshVisibility>0</refreshVisibility>
    <flyToView>1</flyToView>
    <Link>
      <href>${trackKmlUrl}</href>
      ${refreshBlock}
      <viewRefreshMode>never</viewRefreshMode>
    </Link>
  </NetworkLink>
</kml>`;

  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="waypoint-${trip.name.replace(/[^a-z0-9]/gi, "_")}-live.kml"`,
      "Cache-Control": "no-cache",
    },
  });
}
