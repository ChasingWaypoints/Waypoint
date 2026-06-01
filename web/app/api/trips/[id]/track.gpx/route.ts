import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// GET /api/trips/[id]/track.gpx
// Returns a GPX file — compatible with Garmin Basecamp, RideWithGPS, Gaia GPS, etc.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const supabase = await createClient();

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
    .select("lat, lng, altitude_m, speed_kmh, recorded_at, message")
    .eq("trip_id", id)
    .order("recorded_at", { ascending: true });

  if (!points?.length) return new NextResponse("No track data", { status: 404 });

  const trkpts = points.map((p) => `
    <trkpt lat="${p.lat}" lon="${p.lng}">
      ${p.altitude_m ? `<ele>${p.altitude_m}</ele>` : ""}
      <time>${p.recorded_at}</time>
      ${p.speed_kmh ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:speed>${(p.speed_kmh / 3.6).toFixed(2)}</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions>` : ""}
      ${p.message ? `<desc>${p.message}</desc>` : ""}
    </trkpt>`).join("");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Waypoint — waypoint.app"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${trip.name}</name>
    <time>${trip.started_at ?? new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${trip.name}</name>
    <trkseg>${trkpts}
    </trkseg>
  </trk>
</gpx>`;

  const filename = `${trip.name.replace(/[^a-z0-9]/gi, "_")}_waypoint.gpx`;
  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
