import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// GET /api/trips/[id]/track.kml
// Returns a KML file of the full trip route — openable in Google Earth Pro
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const supabase = await createClient();

  // Authenticate via share token (public) or user session
  let trip;
  if (token) {
    const { data } = await supabase
      .from("trips")
      .select("id, name, started_at, ended_at, share_token")
      .eq("id", id)
      .eq("share_token", token)
      .eq("is_public", true)
      .single();
    trip = data;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { data } = await supabase
      .from("trips")
      .select("id, name, started_at, ended_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    trip = data;
  }

  if (!trip) return new NextResponse("Not found", { status: 404 });

  const { data: points } = await supabase
    .from("track_points")
    .select("lat, lng, altitude_m, recorded_at, source, message")
    .eq("trip_id", id)
    .order("recorded_at", { ascending: true });

  if (!points?.length) return new NextResponse("No track data", { status: 404 });

  const coords = points.map((p) => `${p.lng},${p.lat},${p.altitude_m ?? 0}`).join("\n");
  const placemarks = points
    .filter((_, i) => i === 0 || i === points.length - 1 || i % 10 === 0)
    .map((p) => `
    <Placemark>
      <name>${new Date(p.recorded_at).toLocaleTimeString()}</name>
      <description>Source: ${p.source}${p.message ? `\n${p.message}` : ""}</description>
      <Point>
        <coordinates>${p.lng},${p.lat},${p.altitude_m ?? 0}</coordinates>
      </Point>
      <TimeStamp><when>${p.recorded_at}</when></TimeStamp>
    </Placemark>`).join("\n");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${trip.name}</name>
    <description>Waypoint trip track. ${points.length} points recorded.</description>

    <Style id="routeStyle">
      <LineStyle>
        <color>ff3469d4</color>
        <width>3</width>
      </LineStyle>
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

  </Document>
</kml>`;

  const filename = `${trip.name.replace(/[^a-z0-9]/gi, "_")}_waypoint.kml`;
  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
