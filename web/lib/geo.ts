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
  const coords: LngLat[] = [];
  const re = /<(?:trkpt|rtept|wpt)[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(gpx)) !== null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
  }
  return coords;
}
