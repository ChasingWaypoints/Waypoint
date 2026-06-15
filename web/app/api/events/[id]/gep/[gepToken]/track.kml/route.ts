import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/track.kml
//
// Returns a KML snapshot of ALL riders in the event, plus the organizer's
// uploaded GPX route (if any). GEP polls this every REFRESH_SECONDS via NetworkLink.
//
// Each participant's token logs to gep_access_log for traceability.

// Colours for rider tracks (KML AABBGGRR format)
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
  // Extract <trkpt lat="..." lon="..."> entries
  const matches = [...gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/g)];
  if (!matches.length) {
    // Try lon first
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
  const supabase = createAdminClient();

  // Validate token belongs to this event
  const { data: callerParticipant } = await supabase
    .from("event_participants")
    .select("id, display_name")
    .eq("gep_token", gepToken)
    .eq("event_id", id)
    .maybeSingle();

  if (!callerParticipant) return new NextResponse("Invalid or expired GEP token", { status: 401 });

  // Log this fetch
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  await supabase.from("gep_access_log").insert({
    participant_id: callerParticipant.id,
    event_id: id,
    ip_address: ip,
    user_agent: request.headers.get("user-agent") || "unknown",
  });

  // Load event + all participants
  const { data: event } = await supabase
    .from("events")
    .select("id, name, status, route_gpx, route_name")
    .eq("id", id)
    .single();

  if (!event) return new NextResponse("Event not found", { status: 404 });

  const { data: participants } = await supabase
    .from("event_participants")
    .select("id, user_id, display_name, role")
    .eq("event_id", id)
    .order("role");

  // For each participant, load their latest active trip's track points
  const riderData = await Promise.all(
    (participants ?? []).map(async (p: any, i: number) => {
      // Find most recent trip (active first, then recent completed)
      let tripId: string | null = null;

      const { data: activeTrip } = await supabase
        .from("trips")
        .select("id")
        .eq("user_id", p.user_id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeTrip) {
        tripId = activeTrip.id;
      } else {
        const { data: recentTrip } = await supabase
          .from("trips")
          .select("id")
          .eq("user_id", p.user_id)
          .gte("started_at", new Date(Date.now() - 86400000).toISOString())
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentTrip) tripId = recentTrip.id;
      }

      if (!tripId) return { participant: p, points: [], color: RIDER_COLORS[i % RIDER_COLORS.length] };

      const { data: points } = await supabase
        .from("track_points")
        .select("lat, lng, altitude_m, speed_kmh, recorded_at")
        .eq("trip_id", tripId)
        .order("recorded_at", { ascending: true });

      return { participant: p, points: points ?? [], color: RIDER_COLORS[i % RIDER_COLORS.length] };
    })
  );

  // Build KML
  const riderFolders = riderData.map(({ participant, points, color }) => {
    if (!points.length) {
      return `  <Folder><name>${participant.display_name} — No data yet</name></Folder>`;
    }

    const latest = points[points.length - 1];
    const coords = points.map((p: any) => `${p.lng},${p.lat},${p.altitude_m ?? 0}`).join("\n");
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

  // GPX route overlay (if organizer uploaded one)
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
    <description>Waypoint group event · ${riderData.length} riders · Refreshed: ${new Date().toLocaleString()}</description>
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
