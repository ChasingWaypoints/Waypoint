/**
 * Parse a position typed or pasted in any of the four formats Waypoint shows.
 *
 * This is the radio case: sweep reads a position over the air, somebody types
 * it into the command page with one glove off. So it is deliberately forgiving
 * — degree symbols optional, comma optional, hemisphere letter before or after,
 * minus signs or N/S/E/W, any amount of whitespace. It accepts everything
 * allCoordFormats() emits and the shapes people actually type.
 *
 * Returns null when it cannot be read as a position. Never guesses: an
 * ambiguous string is a failure, not a coordinate somewhere in the desert.
 */
export type ParsedCoord = { lat: number; lng: number; format: "decimal" | "dms" | "ddm" | "utm" };

const NORM = (s: string) =>
  s
    .replace(/[°º]/g, "°")                 // masculine ordinal typed for degree
    .replace(/[′’'`´]/g, "'")          // prime / smart quote / backtick
    .replace(/[″”"]/g, '"')                 // double prime / smart quote
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function hemis(v: number, h: string | undefined, negLetter: string): number {
  if (!h) return v;
  return h === negLetter ? -Math.abs(v) : Math.abs(v);
}

// ── UTM → WGS-84 ────────────────────────────────────────────────────────────
// formatUTM() only goes one way; this is the inverse, same ellipsoid.
export function utmToLatLng(zone: number, band: string, easting: number, northing: number) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const south = band < "N";                 // bands C–M are southern
  const x = easting - 500000;
  const y = south ? northing - 10000000 : northing;

  const M = y / k0;
  const mu =
    M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lngOrigin = (zone - 1) * 6 - 180 + 3;
  const lng =
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) / 120) /
    Math.cos(phi1);

  return {
    lat: (lat * 180) / Math.PI,
    lng: lngOrigin + (lng * 180) / Math.PI,
  };
}

const inRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/**
 * Tokenised rather than one regex per format: overlapping patterns quietly
 * mis-parsed real input — "32.5149N 117.0382W" matched the DDM shape as
 * 3° 2.5149' and produced a point 3000 km away. Counting the numbers first is
 * unambiguous: 2 is decimal, 4 is degrees+minutes, 6 is degrees+minutes+seconds.
 */
export function parseCoordinates(raw: string): ParsedCoord | null {
  if (!raw) return null;
  const s = NORM(raw);

  // ── UTM first: a zone digit-pair plus band letter is unlike anything else.
  const utm = s.match(/^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{1,7})\s*(?:M?E)?\s+(\d{1,8})\s*(?:M?N)?$/);
  if (utm) {
    const zone = Number(utm[1]);
    if (zone < 1 || zone > 60) return null;
    const { lat, lng } = utmToLatLng(zone, utm[2], Number(utm[3]), Number(utm[4]));
    return inRange(lat, lng) ? { lat, lng, format: "utm" } : null;
  }

  // Anything that is not a number, a hemisphere letter or a unit mark means
  // this is not a coordinate — refuse rather than parse a fragment of it.
  if (/[^0-9NSEW°'"\-+. ]/.test(s)) return null;

  // Pull the numbers out in order, and the hemisphere letters in order.
  const nums = (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const hemi = (s.match(/[NSEW]/g) ?? []);
  if (nums.some((n) => !Number.isFinite(n))) return null;

  // With no hemisphere letters we need signs, and only decimal can carry them.
  // With letters we need exactly two, one per axis.
  if (hemi.length !== 0 && hemi.length !== 2) return null;
  if (hemi.length === 2) {
    const ns = hemi.filter((h) => h === "N" || h === "S").length;
    if (ns !== 1) return null;                       // one latitude, one longitude
  }

  let aVal: number, bVal: number, format: ParsedCoord["format"];
  if (nums.length === 2) {
    [aVal, bVal] = nums;
    format = "decimal";
  } else if (nums.length === 4) {
    if (nums[1] < 0 || nums[1] >= 60 || nums[3] < 0 || nums[3] >= 60) return null;
    aVal = Math.abs(nums[0]) + nums[1] / 60;
    bVal = Math.abs(nums[2]) + nums[3] / 60;
    format = "ddm";
  } else if (nums.length === 6) {
    if (nums[1] < 0 || nums[1] >= 60 || nums[2] < 0 || nums[2] >= 60) return null;
    if (nums[4] < 0 || nums[4] >= 60 || nums[5] < 0 || nums[5] >= 60) return null;
    aVal = Math.abs(nums[0]) + nums[1] / 60 + nums[2] / 3600;
    bVal = Math.abs(nums[3]) + nums[4] / 60 + nums[5] / 3600;
    format = "dms";
  } else {
    return null;
  }

  let lat: number, lng: number;
  if (hemi.length === 2) {
    // Whichever letter is N/S marks the latitude, so "W117… N32…" still reads.
    const aIsLat = hemi[0] === "N" || hemi[0] === "S";
    lat = hemis(aIsLat ? aVal : bVal, aIsLat ? hemi[0] : hemi[1], "S");
    lng = hemis(aIsLat ? bVal : aVal, aIsLat ? hemi[1] : hemi[0], "W");
  } else {
    if (format !== "decimal") return null;           // "32 30 53.6 117 2 17.5" is ambiguous
    lat = aVal;
    lng = bVal;
  }

  return inRange(lat, lng) ? { lat, lng, format } : null;
}
