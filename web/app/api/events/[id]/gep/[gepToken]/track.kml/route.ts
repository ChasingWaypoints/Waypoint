import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/track.kml
//
// Returns a KML snapshot of ALL riders in the event plus the organizer's GPX route.
// Polled every REFRESH_SECONDS by GEP via the NetworkLink file.
// Token validation + all data queries use SECURITY DEFINER RPCs —
// no SUPABASE_SERVICE_ROLE_KEY needed.

const RIDER_COLORS = [
  "ff1c69d4", // blue
  "ff00aa44", // green
  "ffcc3300", // red-orange
  "ffcc00aa", // purple
  "ff0099cc", // cyan
  "ffff6600", // orange
  "ff006699", // teal
  "ffcc6600", // amber
];

function gpxToKmlCoords(gpx: string): string {
  const matches = [...gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/g)];
  if (!matches.length) {
    const matches2 = [...gpx.matchAll(/<trkpt\s+lon="([^"]+)"\s+lat="([^"]+)"[^>]*>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/g)];
    return matches2.map((m) => `${m[1]},${m[2]},${m[3] ?? 0}`).join("\n");
  }
  return matches.map((m) => `${m[2]},${m[1]},${m[3] ?? 0}`).join("\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gepToken: string }> }
) {
  const { id, gepToken } = await params;
  const supabase = createAnonClient();

  // ── Validate token (also returns event info) ──────────────────
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
  const event: { id: string; name: string; status: string; route_gpx: string | null; route_name: string | null } = tokenData.event;

  // ── Log this fetch ────────────────────────────────────────────
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

  // ── Load participants ─────────────────────────────────────────
  const { data: participants } = await supabase.rpc(
    "get_event_participants_for_gep",
    { p_event_id: id }
  );

  // ── Fetch each rider's track ───────────────────────────────────
  const riderData = await Promise.all(
    (participants ?? []).map(async (p: { id: string; user_id: string; display_name: string; role: string }, i: number) => {
      const { data: points } = await supabase.rpc("get_rider_track", {
        p_user_id:    p.user_id,
        p_max_points: 500,
      });
      return {
        participant: p,
        points: (points ?? []) as { lat: number; lng: number; altitude_m: number; speed_kmh: number; recorded_at: string }[],
        color: RIDER_COLORS[i % RIDER_COLORS.length],
      };
    })
  );

  // ── Build KML folders ─────────────────────────────────────────
  const riderFolders = riderData.map(({ participant, points, color }) => {
    if (!points.length) {
      return `  <Folder><name>${participant.display_name} — No data yet</name></Folder>`;
    }

    const latest = points[points.length - 1];
    const coords = points.map((p: { lat: number; lng: number; altitude_m: number }) => `${p.lng},${p.lat},${p.altitude_m ?? 0}`).join("\n");
    const ago = Math.round((Date.now() - new Date(latest.recorded_at).getTime()) / 60000);
    const agoStr = ago < 2 ? "just now" : `${ago}m ago`;

    return `  <Folder>
    <name>${participant.display_name}${participant.role === "organizer" ? " ★" : ""}</name>
    <Style id="track-${participant.id}">
      <LineStyle><color>${color}</color><width>3</width></LineStyle>
    </Style>
    <Style id="dot-${participant.id}">
      <IconStyle>
        <scale>1.3</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
        <color>${color}</color>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>
    <Placemark>
      <name>${participant.display_name} — Route</name>
      <styleUrl>#track-${participant.id}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>${participant.display_name}</name>
      <description>Speed: ${latest.speed_kmh?.toFixed(1) ?? "?"} km/h · Last seen: ${agoStr}</description>
      <styleUrl>#dot-${participant.id}</styleUrl>
      <TimeStamp><when>${latest.recorded_at}</when></TimeStamp>
      <Point><coordinates>${latest.lng},${latest.lat},${latest.altitude_m ?? 0}</coordinates></Point>
    </Placemark>
  </Folder>`;
  }).join("\n");

  // ── GPX planned route overlay ─────────────────────────────────
  let routeFolder = "";
  if (event.route_gpx) {
    const routeCoords = gpxToKmlCoords(event.route_gpx);
    if (routeCoords) {
      routeFolder = `
  <Folder>
    <name>📍 Planned Route${event.route_name ? ": " + event.route_name : ""}</name>
    <Style id="planned-route">
      <LineStyle>
        <color>7f00ff00</color>
        <width>4</width>
        <gx:labelVisibility>0</gx:labelVisibility>
      </LineStyle>
      <PolyStyle><fill>0</fill></PolyStyle>
    </Style>
    <Placemark>
      <name>${event.route_name ?? "Planned Route"}</name>
      <styleUrl>#planned-route</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${routeCoords}</coordinates>
      </LineString>
    </Placemark>
  </Folder>`;
    }
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${event.name}${event.status === "active" ? " 🔴 LIVE" : ""} — All Riders</name>
    <description>Waypoint group event · ${riderData.length} riders · Viewer: ${holderName} · Refreshed: ${new Date().toLocaleString()}</description>
    ${routeFolder}
    ${riderFolders}
  </Document>
</kml>`;

  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
