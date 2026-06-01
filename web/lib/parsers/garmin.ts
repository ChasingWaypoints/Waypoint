import { XMLParser } from "fast-xml-parser";

export interface TrackPoint {
  lat: number;
  lng: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
  message: string | null;
  source: "garmin";
}

export function parseGarminKML(xml: string): TrackPoint[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }

  const placemarks = parsed?.kml?.Document?.Folder?.Placemark;
  if (!placemarks) return [];

  const items = Array.isArray(placemarks) ? placemarks : [placemarks];
  const points: TrackPoint[] = [];

  for (const item of items) {
    try {
      const extData = item.ExtendedData?.Data;
      if (!extData) continue;

      const dataMap: Record<string, string> = {};
      const dataItems = Array.isArray(extData) ? extData : [extData];
      for (const d of dataItems) {
        if (d["@_name"] && d.value !== undefined) {
          dataMap[d["@_name"]] = String(d.value);
        }
      }

      const lat = parseFloat(dataMap["Latitude"] ?? "");
      const lng = parseFloat(dataMap["Longitude"] ?? "");
      const timeStr = dataMap["Time UTC"] ?? dataMap["Time"] ?? "";

      if (isNaN(lat) || isNaN(lng) || !timeStr) continue;

      points.push({
        lat,
        lng,
        altitude_m: dataMap["Elevation"] ? parseFloat(dataMap["Elevation"]) : null,
        speed_kmh: dataMap["Velocity"] ? parseFloat(dataMap["Velocity"]) * 1.852 : null,
        recorded_at: new Date(timeStr).toISOString(),
        message: dataMap["Text"] || null,
        source: "garmin",
      });
    } catch {
      continue;
    }
  }

  return points;
}
