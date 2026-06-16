import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../../lib/supabase/auth";

const CUTOFF_MS = 24 * 60 * 60 * 1000; // 24 hours

function ageLabel(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  if (h === 0) return m <= 1 ? "less than a minute" : `${m} minutes`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// GET /api/devices/[id]/test
// Fetches the device feed and checks for a position within the last 24 hours.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, supabase } = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: device } = await supabase
    .from("devices")
    .select("id, type, feed_url, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!device.feed_url) {
    return NextResponse.json({ ok: false, message: "No feed URL stored for this device." });
  }

  const now = Date.now();

  let text = "";
  try {
    const res = await fetch(device.feed_url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Waypoint/1.0" },
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        message: `Feed returned HTTP ${res.status}. Check that your sharing link is still active.`,
      });
    }
    text = await res.text();
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return NextResponse.json({ ok: false, message: "Request timed out — feed URL is not responding." });
    }
    return NextResponse.json({ ok: false, message: `Could not reach device: ${err.message ?? "network error"}` });
  }

  // ── Garmin inReach KML ───────────────────────────────────────────
  // MapShare returns KML with <TimeStamp><when>ISO</when></TimeStamp>
  if (device.type === "garmin") {
    const whenMatches = [...text.matchAll(/<when>([^<]+)<\/when>/g)];
    if (whenMatches.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Feed reachable but no position data yet. Power on your inReach and get a GPS fix in an open sky.",
      });
    }
    // Use the most recent timestamp
    const timestamps = whenMatches
      .map((m) => new Date(m[1]).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a);
    const latest = timestamps[0];
    const age = now - latest;
    const isoStr = new Date(latest).toISOString();
    if (age > CUTOFF_MS) {
      return NextResponse.json({
        ok: false,
        message: `Last fix was ${ageLabel(age)} ago. Power on your inReach and make sure MapShare is enabled.`,
        last_position_at: isoStr,
      });
    }
    return NextResponse.json({
      ok: true,
      message: `Last fix ${ageLabel(age)} ago — device is live. ✓`,
      last_position_at: isoStr,
    });
  }

  // ── SPOT Tracker XML ─────────────────────────────────────────────
  // SPOT XML API returns <dateOccurred> as ISO string or Unix timestamp
  if (device.type === "spot") {
    const isoMatch = text.match(/<dateOccurred>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^<]*)<\/dateOccurred>/);
    const unixMatch = text.match(/<dateOccurred>(\d{10,13})<\/dateOccurred>/);

    let latest: number | null = null;
    let isoStr: string | null = null;

    if (isoMatch) {
      latest = new Date(isoMatch[1]).getTime();
      isoStr = isoMatch[1];
    } else if (unixMatch) {
      const raw = parseInt(unixMatch[1]);
      latest = raw > 1e12 ? raw : raw * 1000; // handle seconds vs ms
      isoStr = new Date(latest).toISOString();
    }

    if (!latest || isNaN(latest)) {
      // Could be a "No Messages" response from SPOT
      if (text.includes("No Messages") || text.includes("noMessages")) {
        return NextResponse.json({
          ok: false,
          message: "Feed reachable but no messages found. Power on your SPOT and enable tracking.",
        });
      }
      return NextResponse.json({
        ok: false,
        message: "Feed reachable but no timestamp found. Check your SPOT is on and tracking.",
      });
    }

    const age = now - latest;
    if (age > CUTOFF_MS) {
      return NextResponse.json({
        ok: false,
        message: `Last message was ${ageLabel(age)} ago. Power on your SPOT and ensure tracking is active.`,
        last_position_at: isoStr,
      });
    }
    return NextResponse.json({
      ok: true,
      message: `Last message ${ageLabel(age)} ago — device is live. ✓`,
      last_position_at: isoStr,
    });
  }

  // ── ZOLEO ────────────────────────────────────────────────────────
  // ZOLEO's tracking page is client-rendered; we can only verify reachability
  // and look for any coordinate-like content in the HTML scaffold.
  if (device.type === "zoleo") {
    if (text.includes("404") && text.length < 500) {
      return NextResponse.json({ ok: false, message: "Tracking link returned 404 — it may have been disabled in the ZOLEO app." });
    }
    // ZOLEO embeds location data in the page; the JSON scaffold often has lat/lng
    const hasCoords = /\"lat(itude)?\"/.test(text) || /"lng|longitude"/.test(text) || /\d{2}\.\d{4,}/.test(text);
    if (hasCoords) {
      return NextResponse.json({ ok: true, message: "ZOLEO tracking page is live and contains location data. ✓" });
    }
    // Page loads but no coords yet (device may be off or not yet sharing)
    return NextResponse.json({
      ok: false,
      message: "ZOLEO tracking page is reachable but shows no position yet. Ensure 'Share My Location' is active in the ZOLEO app and your device has a GPS fix.",
    });
  }

  // Fallback for any other type
  return NextResponse.json({ ok: true, message: "Feed is reachable." });
}
