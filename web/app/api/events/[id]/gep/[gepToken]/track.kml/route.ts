import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../../../../lib/supabase/admin";

// GET /api/events/[id]/gep/[gepToken]/track.kml
//
// KML snapshot of every entrant in the event plus the organizer's planned
// route. Polled every 30s by Google Earth Pro via the NetworkLink file.
//
// Entrants are roster rows (event_participants), which since migration 005
// may have no app account at all — their positions come from the beacon
// feeds the organizer loaded. Entrants who ARE app users fall back to
// their own trip track so nothing regresses for existing events.
//
// Token validation and every query use SECURITY DEFINER RPCs, so no
// service role key is required.

// KML colours are aabbggrr, not rrggbb. These are picked to stay
// distinguishable from each other AND from the terrain in Google Earth.
const RIDER_COLORS = [
  "ff00ffcc", // acid green   (#CCFF00)
  "ff15feff", // palesun      (#FFFE15)
  "ff3399ff", // orange
  "ffff9933", // sky blue
  "ffcc44ff", // pink
  "ff44ffcc", // lime
  "ffffcc00", // cyan-blue
  "ff8888ff", // salmon
];

// Entrant names come from an organizer-supplied CSV. An unescaped "&"
// or "<" in a name would produce invalid KML that Google Earth silently
// refuses to load, so everything interpolated is escaped.
function xml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function gpxToKmlCoords(gpx: string): string {
  const matches = [
    ...gpx.matchAll(
      /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/g
    ),
  ];
  if (!matches.length) {
    const matches2 = [
      ...gpx.matchAll(
        /<trkpt\s+lon="([^"]+)"\s+lat="([^"]+)"[^>]*>(?:[\s\S]*?<ele>([^<]+)<\/ele>)?/g
      ),
    ];
    return matches2.map((m) => `${m[1]},${m[2]},${m[3] ?? 0}`).join("\n");
  }
  return matches.map((m) => `${m[2]},${m[1]},${m[3] ?? 0}`).join("\n");
}

interface Entrant {
  id: string;
  user_id: string | null;
  display_name: string;
  rider_number: string | null;
  rider_class: string | null;
  role: string;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
}

interface Point {
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
}

// Matches the thresholds used on the web map so the two never disagree.
function statusOf(lastSeen: string | null): { label: string; icon: string } {
  if (!lastSeen) return { label: "No fix yet", icon: "wht-blank" };
  const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (mins <= 15) return { label: "Live", icon: "grn-circle" };
  if (mins <= 60) return { label: "Stale", icon: "ylw-circle" };
  return { label: "No signal", icon: "red-circle" };
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
  const event: {
    id: string;
    name: string;
    status: string;
    route_gpx: string | null;
    route_name: string | null;
  } = tokenData.event;

  // ── Log this fetch ────────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  await supabase.rpc("log_gep_access", {
    p_event_id: id,
    p_participant_id: participantId,
    p_credential_id: credentialId,
    p_ip: ip,
    p_user_agent: request.headers.get("user-agent") || "unknown",
  });

  // ── Load the roster ───────────────────────────────────────────
  const { data: roster } = await supabase.rpc("get_event_entrants_for_gep", {
    p_event_id: id,
  });
  const entrants = (roster ?? []) as Entrant[];

  // ── Fetch each entrant's trail ────────────────────────────────
  const riderData = await Promise.all(
    entrants.map(async (e, i) => {
      // Beacon entrants: event_track_points
      const { data: beaconPoints } = await supabase.rpc("get_entrant_track_by_id", {
        p_participant_id: e.id,
        p_max_points: 500,
      });

      let points = (beaconPoints ?? []) as Point[];

      // App users who joined by code still have their positions in trips
      if (points.length === 0 && e.user_id) {
        const { data: tripPoints } = await supabase.rpc("get_rider_track", {
          p_user_id: e.user_id,
          p_max_points: 500,
        });
        points = (tripPoints ?? []) as Point[];
      }

      return { entrant: e, points, color: RIDER_COLORS[i % RIDER_COLORS.length] };
    })
  );

  // ── Build KML folders ─────────────────────────────────────────
  const riderFolders = riderData
    .map(({ entrant, points, color }) => {
      const label = `${entrant.rider_number ? `#${entrant.rider_number} ` : ""}${entrant.display_name}`;
      const name = xml(label) + (entrant.role === "organizer" ? " &#9733;" : "");

      // No trail, but we may still know where they are
      if (points.length === 0) {
        if (entrant.last_lat === null || entrant.last_lng === null) {
          return `  <Folder><name>${name} &mdash; No data yet</name></Folder>`;
        }
        const s = statusOf(entrant.last_seen_at);
        return `  <Folder>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      <description>${s.label}${entrant.rider_class ? ` &middot; ${xml(entrant.rider_class)}` : ""}</description>
      <Style><IconStyle><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/${s.icon}.png</href></Icon></IconStyle></Style>
      <Point><coordinates>${entrant.last_lng},${entrant.last_lat},0</coordinates></Point>
    </Placemark>
  </Folder>`;
      }

      const latest = points[points.length - 1];
      const coords = points
        .map((p) => `${p.lng},${p.lat},${p.altitude_m ?? 0}`)
        .join("\n");
      const s = statusOf(latest.recorded_at);
      const ago = Math.round((Date.now() - new Date(latest.recorded_at).getTime()) / 60000);
      const agoStr = ago < 2 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ${ago % 60}m ago`;

      return `  <Folder>
    <name>${name}</name>
    <Style id="track-${entrant.id}">
      <LineStyle><color>${color}</color><width>3</width></LineStyle>
    </Style>
    <Style id="dot-${entrant.id}">
      <IconStyle>
        <scale>1.3</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/${s.icon}.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>
    <Placemark>
      <name>${name} &mdash; Route</name>
      <styleUrl>#track-${entrant.id}</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>${name}</name>
      <description>${s.label} &middot; last fix ${agoStr}${
        entrant.rider_class ? ` &middot; ${xml(entrant.rider_class)}` : ""
      }${latest.speed_kmh != null ? ` &middot; ${latest.speed_kmh.toFixed(1)} km/h` : ""}</description>
      <styleUrl>#dot-${entrant.id}</styleUrl>
      <TimeStamp><when>${latest.recorded_at}</when></TimeStamp>
      <Point><coordinates>${latest.lng},${latest.lat},${latest.altitude_m ?? 0}</coordinates></Point>
    </Placemark>
  </Folder>`;
    })
    .join("\n");

  // ── GPX planned route overlay ─────────────────────────────────
  let routeFolder = "";
  if (event.route_gpx) {
    const routeCoords = gpxToKmlCoords(event.route_gpx);
    if (routeCoords) {
      routeFolder = `
  <Folder>
    <name>Planned Route${event.route_name ? ": " + xml(event.route_name) : ""}</name>
    <Style id="planned-route">
      <LineStyle><color>c015feff</color><width>4</width></LineStyle>
      <PolyStyle><fill>0</fill></PolyStyle>
    </Style>
    <Placemark>
      <name>${xml(event.route_name) || "Planned Route"}</name>
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

  const reporting = riderData.filter(
    ({ entrant, points }) => points.length > 0 || entrant.last_lat !== null
  ).length;

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${xml(event.name)}${event.status === "active" ? " LIVE" : ""}</name>
    <description>Waypoint &middot; ${reporting} of ${entrants.length} entrants reporting &middot; Viewer: ${xml(
      holderName
    )} &middot; Refreshed ${new Date().toISOString()}</description>
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
