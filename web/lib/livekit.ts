// Server-only LiveKit helpers for Waypoint Comms (live push-to-talk).
//
// LiveKit carries the audio; Postgres (047_event_comms) referees who may talk.
// Never import this from a client component: it reads LIVEKIT_API_SECRET.
//
// Env (Vercel, server-side only):
//   LIVEKIT_URL         wss://<project>.livekit.cloud
//   LIVEKIT_API_KEY
//   LIVEKIT_API_SECRET
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
} from "livekit-server-sdk";

export type LiveKitConfig = { url: string; key: string; secret: string };

export function livekitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  return { url, key, secret };
}

/** The REST API lives on the same host as the websocket URL. */
function apiHost(url: string): string {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

/** Each channel is one microphone track, named after the channel. */
export function trackName(channelId: string): string {
  return `ch:${channelId}`;
}

export function channelFromTrackName(name: string | undefined): string | null {
  if (!name || !name.startsWith("ch:")) return null;
  const id = name.slice(3);
  return UUID_RE.test(id) ? id : null;
}

/** Rooms are one per event: 'event:<event_id>'. */
export function eventFromRoomName(name: string | undefined): string | null {
  if (!name || !name.startsWith("event:")) return null;
  const id = name.slice(6);
  return UUID_RE.test(id) ? id : null;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function mintToken(
  cfg: LiveKitConfig,
  opts: { identity: string; name: string; room: string; metadata: string }
): Promise<string> {
  const at = new AccessToken(cfg.key, cfg.secret, {
    identity: opts.identity,
    name: opts.name,
    metadata: opts.metadata,
    // Long enough for a full race day; the app fetches a fresh one on rejoin.
    ttl: "12h",
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}

export function roomService(cfg: LiveKitConfig): RoomServiceClient {
  return new RoomServiceClient(apiHost(cfg.url), cfg.key, cfg.secret);
}

export function webhookReceiver(cfg: LiveKitConfig): WebhookReceiver {
  return new WebhookReceiver(cfg.key, cfg.secret);
}

/**
 * Silence speakers that an all-call pre-empted. Postgres has already ended
 * their transmissions; this makes LiveKit match. A speaker who has already
 * left the room is not an error.
 */
export async function muteSpeakers(
  cfg: LiveKitConfig,
  room: string,
  speakers: { identity: string; channel_id: string }[]
): Promise<number> {
  if (!speakers.length) return 0;
  const svc = roomService(cfg);
  let muted = 0;
  await Promise.all(
    speakers.map(async (s) => {
      try {
        const p = await svc.getParticipant(room, s.identity);
        const wanted = trackName(s.channel_id);
        for (const t of p.tracks ?? []) {
          if (t.name === wanted && !t.muted) {
            await svc.mutePublishedTrack(room, s.identity, t.sid, true);
            muted++;
          }
        }
      } catch {
        // Participant gone or track already unpublished: nothing to mute.
      }
    })
  );
  return muted;
}
