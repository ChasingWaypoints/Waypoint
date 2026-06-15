import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// GET /api/share/[token]/track.kml
// Returns a live KML snapshot of a public trip, auth'd only by share token.
// Used as the <href> inside the NetworkLink endpoint so GEP can auto-refresh.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, started_at, ended_at, status, share_token")
    .eq("share_token", token)
    .eq("is_public", true)
    .single();

  if (!trip) return new NextResponse("Not found", { status: 404 });

  const { data: points } = await supabase
    .from("track_points")
    .select("lat, lng, altitude_m, recorded_at, source, message")
    .eq("trip_id", trip.id)
    .order("recorded_at", { ascending: true });

  if (!points?.length) {
    // Return a valid empty KML so GEP doesn't error on refresh
    const emptyKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${trip.name} — Waiting for points</name>
    <description>No track points recorded yet. GEP will refresh shortly.</description>
  </Document>
</kml>`;
    return new NextResponse(emptyKml, {
      headers: { "Content-Type": "application/vnd.google-earth.kml+xml" },
    });
  }

  const coords = points.map((p) => `${p.lng},${p.lat},${p.altitude_m ?? 0}`).join("\n");

  // Waypoint placemarks: start + end + every 10th point + any SPOT/Zoleo messages
  const placemarks = points
    .filter((_, i) => i === 0 || i === points.length - 1 || i % 10 === 0)
    .map((p, i) => `
    <Placemark>
      <name>${i === 0 ? "🚀 Start" : p.message ? "📍 " + p.message : new Date(p.recorded_at).toLocaleTimeString()}</name>
      <description>Source: ${p.source}${p.message ? `\n${p.message}` : ""}</description>
      <TimeStamp><when>${p.recorded_at}</when></TimeStamp>
      <Point><coordinates>${p.lng},${p.lat},${p.altitude_m ?? 0}</coordinates></Point>
    </Placemark>`)
    .join("\n");

  // Latest point gets its own highlighted marker so GEP shows "current position"
  const latest = points[points.length - 1];
  const latestPlacemark = `
    <Placemark>
      <name>📍 Current Position</name>
      <description>Last updated: ${new Date(latest.recorded_at).toLocaleString()}\nSource: ${latest.source}</description>
      <TimeStamp><when>${latest.recorded_at}</when></TimeStamp>
      <styleUrl>#currentStyle</styleUrl>
      <Point><coordinates>${latest.lng},${latest.lat},${latest.altitude_m ?? 0}</coordinates></Point>
    </Placemark>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${trip.name}${trip.status === "active" ? " 🔴 LIVE" : ""}</name>
    <description>Waypoint live track · ${points.length} points · Last updated ${new Date(latest.recorded_at).toLocaleString()}</description>

    <Style id="routeStyle">
      <LineStyle>
        <color>ffff6a1c</color>
        <width>4</width>
      </LineStyle>
    </Style>

    <Style id="currentStyle">
      <IconStyle>
        <scale>1.5</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
      </IconStyle>
    </Style>

    <Placemark>
      <name>${trip.name} — Route</name>
      <styleUrl>#routeStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>
${coords}
        </coordinates>
      </LineString>
    </Placemark>

    ${placemarks}
    ${latestPlacemark}

  </Document>
</kml>`;

  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      // No Cache-Control so GEP always fetches fresh on each interval
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
