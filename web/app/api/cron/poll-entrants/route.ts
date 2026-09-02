import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "../../../../lib/supabase/admin";
import { parseGarminKML } from "../../../../lib/parsers/garmin";
import { parseSPOTXML } from "../../../../lib/parsers/spot";

/**
 * Polls the public beacon feeds attached to event entrants.
 *
 * Distinct from /api/cron/poll-devices, which polls devices owned by
 * app users and writes into their trips. Event entrants have no
 * account and no trip — the organizer supplied their public share
 * feed, so positions land in event_track_points instead.
 *
 * All writes go through SECURITY DEFINER RPCs, so no service role key.
 *
 * Schedule: every 2 minutes (see vercel.json).
 */

export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;

// Garmin publishes a rolling window; asking for the last hour keeps the
// payload small while still catching up after a brief outage.
function garminFeedUrl(base: string): string {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}d1=${encodeURIComponent(since)}`;
}

function spotFeedUrl(feedId: string, password: string | null): string {
  const base = `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/${feedId}/message.xml`;
  return password ? `${base}?feedPassword=${encodeURIComponent(password)}` : base;
}

interface Feed {
  id: string;
  event_id: string;
  display_name: string;
  device_type: string;
  feed_url: string | null;
  feed_id: string | null;
  feed_password: string | null;
  last_seen_at: string | null;
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends a bearer token when CRON_SECRET is configured.
  // If the secret is set we require it; if not, the route stays open
  // so it can still be triggered manually during setup.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAnonClient();

  const { data: feeds, error } = await supabase.rpc("get_entrant_feeds");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (feeds ?? []) as Feed[];
  if (list.length === 0) {
    return NextResponse.json({ polled: 0, note: "No active event entrants with feeds" });
  }

  let succeeded = 0;
  let failed = 0;
  let newPoints = 0;
  const problems: { entrant: string; error: string }[] = [];

  // Bounded concurrency — a 300-entrant rally would otherwise open 300
  // sockets at once and trip both Garmin's rate limit and the function
  // timeout.
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((feed) => pollEntrant(supabase, feed))
    );

    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        succeeded++;
        newPoints += r.value;
      } else {
        failed++;
        problems.push({
          entrant: batch[idx].display_name,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  }

  return NextResponse.json({
    polled: list.length,
    succeeded,
    failed,
    new_points: newPoints,
    problems: problems.slice(0, 20),
  });
}

async function pollEntrant(
  supabase: ReturnType<typeof createAnonClient>,
  feed: Feed
): Promise<number> {
  let url: string;

  if (feed.device_type === "garmin") {
    if (!feed.feed_url) throw new Error("No MapShare URL");
    // A brand-new entrant with no fix yet: pull the full feed so their
    // last-known position lands on the map immediately. Once they have a
    // fix, switch to the light last-hour window.
    url = feed.last_seen_at ? garminFeedUrl(feed.feed_url) : feed.feed_url;
  } else if (feed.device_type === "spot") {
    if (!feed.feed_id) throw new Error("No SPOT feed id");
    url = spotFeedUrl(feed.feed_id, feed.feed_password);
  } else {
    return 0;
  }

  let body: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Waypoint/1.0 (+https://app.chasingwaypoints.com)" },
    });

    if (!res.ok) {
      // 401/403 on Garmin almost always means the rider's MapShare is
      // private or password-protected — worth saying so precisely,
      // because that is the single most common setup mistake.
      const hint =
        res.status === 401 || res.status === 403
          ? " — the rider's MapShare page is private or password-protected"
          : "";
      throw new Error(`Feed returned ${res.status}${hint}`);
    }
    body = await res.text();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.rpc("record_entrant_poll", {
      p_participant_id: feed.id,
      p_error: message.slice(0, 300),
    });
    throw e;
  }

  const points =
    feed.device_type === "garmin" ? parseGarminKML(body) : parseSPOTXML(body);

  if (points.length === 0) {
    // Not an error: a stationary beacon that hasn't sent since the last
    // poll legitimately returns nothing.
    await supabase.rpc("record_entrant_poll", {
      p_participant_id: feed.id,
      p_error: null,
    });
    return 0;
  }

  let inserted = 0;
  for (const p of points) {
    const { data, error } = await supabase.rpc("record_entrant_fix", {
      p_participant_id: feed.id,
      p_lat: p.lat,
      p_lng: p.lng,
      p_recorded_at: p.recorded_at,
      p_altitude_m: p.altitude_m,
      p_speed_kmh: p.speed_kmh,
      p_message: p.message,
      p_source: feed.device_type,
    });
    if (!error && data === true) inserted++;
  }

  await supabase.rpc("record_entrant_poll", {
    p_participant_id: feed.id,
    p_error: null,
  });

  return inserted;
}
