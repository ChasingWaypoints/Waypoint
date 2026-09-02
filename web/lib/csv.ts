/**
 * Minimal RFC-4180 CSV reader.
 *
 * Deliberately dependency-free — organizer rosters are small and the
 * failure modes we care about (quoted commas, quoted newlines, escaped
 * quotes, BOM, CRLF, ragged rows) are all handled here.
 */

export function parseCSV(text: string): string[][] {
  // Strip UTF-8 BOM — Excel adds one on "Save as CSV"
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // swallow the \n of a \r\n pair
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  // last field / row if the file does not end in a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // drop entirely blank lines
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Parses a CSV with a header row into objects keyed by a normalised
 * header name (lowercased, non-alphanumerics collapsed to underscore).
 * "Rider Name" and "rider_name" both become `rider_name`.
 */
export function parseCSVWithHeader(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normaliseHeader);

  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

export function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Looks up a value by any of several accepted header spellings.
 * Returns "" when none of them are present.
 */
export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}
