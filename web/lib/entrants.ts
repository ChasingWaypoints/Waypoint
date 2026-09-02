import { pick } from "./csv";

export type DeviceType = "garmin" | "spot" | "zoleo" | "phone" | "manual";

export interface EntrantInput {
  display_name: string;
  rider_number: string | null;
  rider_class: string | null;
  device_type: DeviceType | null;
  feed_url: string | null;
  feed_id: string | null;
  feed_password: string | null;
  notes: string | null;
}

export interface RowError {
  line: number;
  message: string;
  raw: Record<string, string>;
}

/**
 * The columns an organizer's roster CSV may use. First spelling is the
 * canonical one we document; the rest are accepted aliases so a roster
 * exported from a timing system or typed by hand usually just works.
 */
export const CSV_COLUMNS = {
  name: ["name", "rider_name", "display_name", "entrant", "rider", "competitor", "full_name"],
  number: ["number", "rider_number", "race_number", "bib", "bib_number", "no", "num", "start_number"],
  class: ["class", "rider_class", "category", "cat", "division", "group"],
  device: ["device", "device_type", "beacon", "beacon_type", "tracker", "type"],
  feed: ["feed", "feed_url", "share_link", "share_url", "mapshare", "mapshare_url", "url", "link", "feed_id", "spot_feed_id", "glid"],
  password: ["password", "feed_password", "spot_password"],
  notes: ["notes", "note", "comment", "comments"],
};

export const CSV_TEMPLATE =
  "name,number,class,device,feed,password,notes\n" +
  "Skyler Howes,42,RallyPro,garmin,https://share.garmin.com/SkylerH,,\n" +
  "Mason Klein,7,RallyPro,spot,0AbCdEfGhIjKlMnOpQrStUvWxYz123456,,\n" +
  "Ace Nilson,113,Rally1,garmin,https://share.garmin.com/Feed/Share/acenilson,,\n" +
  "Jacob Argubright,88,Adventure Bike,zoleo,,,ZOLEO pushes by webhook — no feed needed\n";

/**
 * Garmin MapShare links come in several shapes. All of these are valid
 * and we normalise them to the KML feed endpoint the poller wants:
 *   https://share.garmin.com/Feed/Share/<name>
 *
 * Accepted input:
 *   share.garmin.com/SkylerH
 *   https://share.garmin.com/SkylerH
 *   https://share.garmin.com/Feed/Share/SkylerH
 *   https://share.garmin.com/share/SkylerH
 *   https://eur.inreach.garmin.com/Feed/Share/SkylerH   (regional hosts kept)
 */
export function normaliseGarminFeed(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/garmin\.com$/i.test(url.hostname)) return null;

  // Already a feed URL — keep the host, it may be a regional one
  if (/^\/feed\/share\//i.test(url.pathname)) {
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const name = segments[segments.length - 1];
  if (!name) return null;

  return `${url.origin}/Feed/Share/${name}`;
}

/** SPOT feed ids are long alphanumeric strings; accept a shared page URL too. */
export function normaliseSpotFeed(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromUrl = raw.match(/(?:glId=|\/shared\/)([A-Za-z0-9]{20,})/);
  if (fromUrl) return fromUrl[1];

  if (/^[A-Za-z0-9]{20,}$/.test(raw)) return raw;
  return null;
}

function inferDeviceType(deviceRaw: string, feedRaw: string): DeviceType | null {
  const d = deviceRaw.trim().toLowerCase();
  if (d.includes("garmin") || d.includes("inreach")) return "garmin";
  if (d.includes("spot")) return "spot";
  if (d.includes("zoleo")) return "zoleo";
  if (d.includes("phone") || d.includes("app")) return "phone";
  if (d.includes("manual") || d.includes("none")) return "manual";

  // No device column — infer from the feed itself
  if (/garmin\.com/i.test(feedRaw)) return "garmin";
  if (/findmespot|spot/i.test(feedRaw)) return "spot";
  if (feedRaw && /^[A-Za-z0-9]{20,}$/.test(feedRaw.trim())) return "spot";

  return null;
}

/**
 * Turns one CSV row into an entrant, or explains why it can't.
 * `line` is the 1-based line number in the original file (header = 1).
 */
export function rowToEntrant(
  row: Record<string, string>,
  line: number
): { entrant: EntrantInput } | { error: RowError } {
  const name = pick(row, ...CSV_COLUMNS.name);
  if (!name) {
    return { error: { line, message: "Missing entrant name", raw: row } };
  }

  const deviceRaw = pick(row, ...CSV_COLUMNS.device);
  const feedRaw = pick(row, ...CSV_COLUMNS.feed);
  const deviceType = inferDeviceType(deviceRaw, feedRaw);

  const entrant: EntrantInput = {
    display_name: name,
    rider_number: pick(row, ...CSV_COLUMNS.number) || null,
    rider_class: pick(row, ...CSV_COLUMNS.class) || null,
    device_type: deviceType,
    feed_url: null,
    feed_id: null,
    feed_password: pick(row, ...CSV_COLUMNS.password) || null,
    notes: pick(row, ...CSV_COLUMNS.notes) || null,
  };

  if (deviceType === "garmin") {
    if (!feedRaw) {
      return { error: { line, message: `"${name}": Garmin entrant has no MapShare link`, raw: row } };
    }
    const feed = normaliseGarminFeed(feedRaw);
    if (!feed) {
      return {
        error: {
          line,
          message: `"${name}": "${feedRaw}" is not a recognisable Garmin MapShare link`,
          raw: row,
        },
      };
    }
    entrant.feed_url = feed;
  } else if (deviceType === "spot") {
    if (!feedRaw) {
      return { error: { line, message: `"${name}": SPOT entrant has no feed id`, raw: row } };
    }
    const feed = normaliseSpotFeed(feedRaw);
    if (!feed) {
      return {
        error: {
          line,
          message: `"${name}": "${feedRaw}" is not a recognisable SPOT feed id`,
          raw: row,
        },
      };
    }
    entrant.feed_id = feed;
  }
  // zoleo / phone / manual / unknown: roster row with no feed to poll.
  // ZOLEO pushes to the webhook; the others are placeholders the
  // organizer can fill in later from the dashboard.

  return { entrant };
}
