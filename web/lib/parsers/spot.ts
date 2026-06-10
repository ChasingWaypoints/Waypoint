import { XMLParser } from "fast-xml-parser";
import { TrackPoint } from "./garmin";

export function parseSPOTXML(xml: string): TrackPoint[] {
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

  const messages = parsed?.response?.feedMessageResponse?.messages?.message;
  if (!messages) return [];

  const items = Array.isArray(messages) ? messages : [messages];
  const points: TrackPoint[] = [];

  for (const item of items) {
    try {
      const lat = parseFloat(item.latitude);
      const lng = parseFloat(item.longitude);
      const unixTime = parseInt(item.unixTime ?? item.dateTime ?? "");

      if (isNaN(lat) || isNaN(lng) || isNaN(unixTime)) continue;

      points.push({
        lat,
        lng,
        altitude_m: item.altitude ? parseFloat(item.altitude) : null,
        speed_kmh: null,
        recorded_at: new Date(unixTime * 1000).toISOString(),
        message: item.messageContent || null,
        source: "spot",
      });
    } catch {
      continue;
    }
  }

  return points;
}
