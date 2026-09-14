/**
 * coords.ts
 *
 * Position formatting, ported from the web so both surfaces speak the same
 * language. Decimal is primary; DMS, DDM and UTM exist because a search-and-
 * rescue crew, a race official and a helicopter pilot will each ask for a
 * different one, and converting in your head at the roadside is not a plan.
 */

export type CoordFormat = "decimal" | "dms" | "ddm" | "utm";

export const COORD_FORMAT_LABELS: Record<CoordFormat, string> = {
  decimal: "Decimal",
  dms: "DMS",
  ddm: "DDM",
  utm: "UTM",
};

function pad(n: number, width: number, decimals = 0): string {
  return n.toFixed(decimals).padStart(width + (decimals ? decimals + 1 : 0), "0");
}

/** 32.715736, -117.161087 */
export function formatDecimal(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** 32°42'56.6"N 117°09'39.9"W */
export function formatDMS(lat: number, lng: number): string {
  const part = (v: number, pos: string, neg: string, degWidth: number) => {
    const hemi = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    let d = Math.floor(abs);
    let m = Math.floor((abs - d) * 60);
    let s = (abs - d - m / 60) * 3600;
    // Rounding can carry: 59.996" must not print as 60".
    if (Number(s.toFixed(1)) >= 60) { s = 0; m += 1; }
    if (m >= 60) { m = 0; d += 1; }
    return `${pad(d, degWidth)}°${pad(m, 2)}'${pad(s, 2, 1)}"${hemi}`;
  };
  return `${part(lat, "N", "S", 2)} ${part(lng, "E", "W", 3)}`;
}

/** 32°42.943'N 117°09.665'W */
export function formatDDM(lat: number, lng: number): string {
  const part = (v: number, pos: string, neg: string, degWidth: number) => {
    const hemi = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    let d = Math.floor(abs);
    let m = (abs - d) * 60;
    if (Number(m.toFixed(3)) >= 60) { m = 0; d += 1; }
    return `${pad(d, degWidth)}°${pad(m, 2, 3)}'${hemi}`;
  };
  return `${part(lat, "N", "S", 2)} ${part(lng, "E", "W", 3)}`;
}

/**
 * WGS84 → UTM. Standard Transverse Mercator series, accurate to well under a
 * metre in normal use — far finer than any phone's GPS.
 */
export function formatUTM(lat: number, lng: number): string {
  if (lat < -80 || lat > 84) return "UTM n/a at this latitude";

  const a = 6378137.0;            // WGS84 semi-major axis
  const f = 1 / 298.257223563;    // flattening
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);

  const zone = Math.floor((lng + 180) / 6) + 1;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;

  const rad = Math.PI / 180;
  const latR = lat * rad;
  const lngR = lng * rad;
  const lonOriginR = lonOrigin * rad;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latR) ** 2);
  const T = Math.tan(latR) ** 2;
  const C = ep2 * Math.cos(latR) ** 2;
  const A = Math.cos(latR) * (lngR - lonOriginR);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latR -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latR) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latR) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latR));

  const easting =
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000.0;

  let northing =
    k0 *
    (M +
      N *
        Math.tan(latR) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  if (lat < 0) northing += 10000000.0; // southern hemisphere false northing

  return `${zone}${utmLatBand(lat)} ${Math.round(easting)}E ${Math.round(northing)}N`;
}

/** MGRS-style latitude band letter — the bit crews read back. */
function utmLatBand(lat: number): string {
  const bands = "CDEFGHJKLMNPQRSTUVWX";
  if (lat < -80 || lat > 84) return "";
  if (lat > 72) return "X"; // band X is 12° tall, not 8°
  return bands.charAt(Math.floor((lat + 80) / 8));
}

export function formatCoord(fmt: CoordFormat, lat: number, lng: number): string {
  switch (fmt) {
    case "dms": return formatDMS(lat, lng);
    case "ddm": return formatDDM(lat, lng);
    case "utm": return formatUTM(lat, lng);
    default: return formatDecimal(lat, lng);
  }
}

/** Opens the native maps app on either platform. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
