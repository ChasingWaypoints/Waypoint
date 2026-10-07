import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import {
  channelFromTrackName,
  eventFromRoomName,
  livekitConfig,
  roomService,
  webhookReceiver,
} from "../../../../lib/livekit";

// POST /api/comms/webhook — LiveKit Cloud webhooks (signed with the API key).
//
//   participant_left / participant_connection_aborted
//       -> release anything that person was holding, so a rider who rides
//          into a dead zone mid-sentence doesn't lock the channel.
//   track_published
//       -> a mic track must be named after a channel this person may talk on;
//          anything else is muted on arrival.
//
// Uses the service-role client: the helpers it calls are granted to
// service_role only.
export async function POST(request: NextRequest) {
  const cfg = livekitConfig();
  if (!cfg) return NextResponse.json({ error: "comms_not_configured" }, { status: 503 });

  const raw = await request.text();
  let event;
  try {
    event = await webhookReceiver(cfg).receive(
      raw,
      request.headers.get("authorization") ?? undefined
    );
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const room = event.room?.name;
  const eventId = eventFromRoomName(room);
  const identity = event.participant?.identity;
  if (!eventId || !room || !identity) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();

  if (event.event === "participant_left" || event.event === "participant_connection_aborted") {
    await admin.rpc("comms_release_identity", { p_event_id: eventId, p_identity: identity });
    return NextResponse.json({ ok: true });
  }

  if (event.event === "track_published" && event.track?.sid) {
    const channel = channelFromTrackName(event.track.name);
    let allowed = false;
    if (channel) {
      const { data } = await admin.rpc("comms_identity_can_talk", {
        p_event_id: eventId,
        p_identity: identity,
        p_channel_id: channel,
      });
      allowed = data === true;
    }
    if (!allowed) {
      try {
        await roomService(cfg).mutePublishedTrack(room, identity, event.track.sid, true);
      } catch {
        // Already gone.
      }
    }
    return NextResponse.json({ ok: true, allowed });
  }

  return NextResponse.json({ ok: true });
}
