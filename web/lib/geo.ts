/**
 * Small geodesy helpers. Deliberately dependency-free — turf.js would
 * add ~200 KB to the bundle for what amounts to two formulas.
 */

const EARTH_RADIUS_M = 6_371_008.8;

export interface LngLat {
  lng: number;
  lat: number;
}

/** Great-circle distance in metres (haversine). */
export function haversine(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Total length of a path in metres. */
export function pathLength(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1], points[i]);
  }
  return total;
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function compassPoint(deg: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const normalised = ((deg % 360) + 360) % 360;
  return points[Math.round(normalised / 22.5) % 16];
}

/**
 * Formats a distance for display. Rally organizers work in kilometres
 * but a US club event may want miles, so both are offered.
 */
export function formatDistance(metres: number, unit: "km" | "mi" = "km"): string {
  if (unit === "mi") {
    const feet = metres * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(metres / 1609.344).toFixed(2)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** "4 min ago", "2 h 15 min ago" — for last-seen timestamps. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "no fix yet";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours} h ${rem} min ago` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Bounding box of a set of points, as Mapbox expects it. */
export function boundsOf(points: LngLat[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLng = points[0].lng, maxLng = points[0].lng;
  let minLat = points[0].lat, maxLat = points[0].lat;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Minimal GPX track/route extraction for drawing an event route. */
export function parseGPXCoordinates(gpx: string): LngLat[] {
  // The route line comes from track (<trkpt>) or route (<rtept>) points.
  // Standalone <wpt> waypoints are NOT part of the line — they are pins —
  // so including them would zig-zag the route. Only fall back to <wpt> when
  // a file has no track/route points at all.
  const collect = (tags: string) => {
    const coords: LngLat[] = [];
    const re = new RegExp(`<(?:${tags})[^>]*\\blat="([-\\d.]+)"[^>]*\\blon="([-\\d.]+)"`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(gpx)) !== null) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
    }
    // handle lon-before-lat too
    const re2 = new RegExp(`<(?:${tags})[^>]*\\blon="([-\\d.]+)"[^>]*\\blat="([-\\d.]+)"`, "gi");
    while ((m = re2.exec(gpx)) !== null) {
      const lng = parseFloat(m[1]);
      const lat = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
    }
    return coords;
  };
  const line = collect("trkpt|rtept");
  return line.length ? line : collect("wpt");
}

/**
 * Waypoint pulled from a GPX <wpt> element. OpenRally files mark the scoring
 * type as a flag child element inside <extensions> (e.g. <openrally:wpm/>,
 * <openrally:dss/>, <openrally:checkpoint/>), not in <type>. The note number
 * is the trailing digits of the name (..._001).
 *
 * `label` is what the map shows: the scoring type code followed by the note
 * number when the waypoint has a type (e.g. WPM026), otherwise just the
 * 3-digit note number (e.g. 014).
 */
export interface Waypoint {
  lat: number;
  lng: number;
  name: string;
  type: string | null;   // scoring type code, e.g. WPM / DSS / CKP, or null
  num: string;           // 3-digit note number
  label: string;         // type ?? num — what the map pin shows
  desc: string | null;
}

function wpTag(block: string, name: string): string | null {
  const m = block.match(new RegExp("<" + name + "[^>]*>([^]*?)</" + name + ">", "i"));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim() || null;
}

// OpenRally flag element -> the code shown on the map. Anything not listed
// here (distance, cap, tulip, notes, show_coordinates, units, format) is
// metadata, not a waypoint type.
const OPENRALLY_TYPE: Record<string, string> = {
  dss: "DSS", fss: "FSS", start: "DSS", finish: "FSS",
  wpm: "WPM", wpe: "WPE", wpv: "WPV", wps: "WPS", wpc: "WPC", wpk: "WPK",
  checkpoint: "CKP", cp: "CKP", ckp: "CKP",
  fuel: "FUEL", reset: "RST", neutralization: "NEU", neutralisation: "NEU",
  ass: "ASS", sz: "SZ", dz: "DZ",
};

/** Extracts named waypoints from a GPX / OpenRally file. */
export function parseGPXWaypoints(gpx: string): Waypoint[] {
  const out: Waypoint[] = [];
  const re = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;
  let m: RegExpExecArray | null;
  let seq = 0;
  while ((m = re.exec(gpx)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const lat = parseFloat((attrs.match(/\blat\s*=\s*"([-\d.]+)"/i) || [])[1] ?? "");
    const lng = parseFloat((attrs.match(/\blon\s*=\s*"([-\d.]+)"/i) || [])[1] ?? "");
    if (isNaN(lat) || isNaN(lng)) continue;
    seq++;

    const name = wpTag(body, "name") || wpTag(body, "desc") || `WP${seq}`;

    // Scoring type: first OpenRally flag element that maps to a code, or a
    // classic <type>/<sym> if present.
    let type: string | null = null;
    for (const fm of body.matchAll(/<(?:\w+:)?([a-zA-Z_]+)\s*\/?\s*>/g)) {
      const code = OPENRALLY_TYPE[fm[1].toLowerCase()];
      if (code) { type = code; break; }
    }
    if (!type) {
      const raw = (wpTag(body, "type") || wpTag(body, "sym") || "").trim().toUpperCase();
      if (raw && raw.length <= 5) type = raw;
    }

    // Note number: trailing digits of the name, else the sequence.
    const digits = (name.match(/(\d+)\s*$/) || [])[1];
    const num = (digits ? digits : String(seq)).padStart(3, "0").slice(-3);

    out.push({ lat, lng, name, type, num, label: type ? type + num : num, desc: wpTag(body, "desc") });
  }
  return out;
}

