"use client";

/**
 * CommsPanel — live push-to-talk radio for the Command View.
 *
 * Audio is LIVE over LiveKit (one room per event). Each channel this person
 * may talk on is its own muted microphone track named `ch:<channel_id>`;
 * holding the button asks Postgres for the floor (/api/comms/floor) and only
 * unmutes after it is granted, so one person talks per channel, like a radio.
 * Listening is by subscription: only tracks on channels this person may hear
 * (and hasn't switched off) are subscribed and played.
 *
 * Nothing is recorded or queued here. If the connection drops, talking stops.
 * Renders nothing when comms is off for the event or the link can't use it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type RemoteTrack,
} from "livekit-client";
import { theme, font, text } from "../lib/theme";

type ChannelKind = "race_control" | "staff" | "all_riders" | "class";
type Channel = { id: string; kind: ChannelKind; name: string; rider_class: string | null; can_talk: boolean };
type Join = {
  url: string;
  token: string;
  room: string;
  identity: string;
  label: string;
  role: string;
  event_name: string;
  channels: Channel[];
};
type Instruction = { transmission_id: string; speaker: string; started_at: string; age_s: number } | null;
type Status = "idle" | "connecting" | "live" | "reconnecting";

const TRACK_PREFIX = "ch:";
const chanOf = (name?: string) => (name && name.startsWith(TRACK_PREFIX) ? name.slice(TRACK_PREFIX.length) : null);

// Radio cues: talk-permit chirp, end-of-transmission, busy.
function beep(ctx: AudioContext | null, freqs: number[], ms = 70) {
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
    t += ms / 1000 + 0.02;
  }
}
const permitTone = (c: AudioContext | null) => beep(c, [1200, 1600], 60);
const endTone = (c: AudioContext | null) => beep(c, [900], 80);
const busyTone = (c: AudioContext | null) => beep(c, [420, 420, 420], 90);

function ago(seconds: number) {
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

export default function CommsPanel({
  token,
  layout = "overlay",
  onUnavailable,
}: {
  token: string;
  /** "overlay" floats over the Command View map; "page" fills /radio on a phone. */
  layout?: "overlay" | "page";
  /** Called when comms is off, the event ended, or this token was revoked. */
  onUnavailable?: () => void;
}) {
  const [join, setJoin] = useState<Join | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [talkChannel, setTalkChannel] = useState<string | null>(null);
  const [allCall, setAllCall] = useState(false);
  const [listenOff, setListenOff] = useState<Set<string>>(new Set());
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [talking, setTalking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<Instruction>(null);
  const [collapsed, setCollapsed] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const pubsRef = useRef<Map<string, LocalTrackPublication>>(new Map());
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const pressRef = useRef(false);
  const txRef = useRef<string | null>(null);
  const txChannelRef = useRef<string | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinRef = useRef<Join | null>(null);
  const listenOffRef = useRef<Set<string>>(listenOff);

  useEffect(() => { joinRef.current = join; }, [join]);
  useEffect(() => { listenOffRef.current = listenOff; }, [listenOff]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  // "unavailable" = comms is off for this event, or this link can't use it.
  const fetchJoin = useCallback(async (): Promise<Join | "unavailable"> => {
    const res = await fetch("/api/comms/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401 || res.status === 403 || res.status === 503) return "unavailable";
    if (!res.ok) throw new Error("Could not reach comms.");
    return (await res.json()) as Join;
  }, [token]);

  // Probe once: is comms on for this event, and may this link use it?
  useEffect(() => {
    let alive = true;
    fetchJoin()
      .then((j) => {
        if (!alive) return;
        if (j === "unavailable") { setUnavailable(true); onUnavailable?.(); return; }
        setJoin(j);
        const rc = j.channels.find((c) => c.can_talk && c.kind === "race_control");
        setTalkChannel(rc?.id ?? j.channels.find((c) => c.can_talk)?.id ?? null);
      })
      .catch(() => { if (alive) setError("Could not reach comms."); });
    return () => { alive = false; };
  }, [fetchJoin, onUnavailable]);

  // Subscribe to exactly the channels being listened to; note who is talking.
  const refreshSubs = useCallback(() => {
    const room = roomRef.current;
    const j = joinRef.current;
    if (!room || !j) return;
    const known = new Set(j.channels.map((c) => c.id));
    const live: Record<string, string> = {};
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const ch = chanOf(pub.trackName);
        if (!ch || !known.has(ch) || pub.kind !== Track.Kind.Audio) return;
        const want = !listenOffRef.current.has(ch);
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
        if (!pub.isMuted) live[ch] = p.name || p.identity;
      });
    });
    setSpeakers(live);
  }, []);

  useEffect(() => { if (status === "live") refreshSubs(); }, [listenOff, status, refreshSubs]);

  const loadInstruction = useCallback(async () => {
    try {
      const res = await fetch("/api/comms/instruction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      setInstruction(d?.instruction ?? null);
    } catch {
      // Banner is a convenience; never block the radio on it.
    }
  }, [token]);

  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(loadInstruction, 60_000);
    return () => clearInterval(t);
  }, [status, loadInstruction]);

  const teardown = useCallback(() => {
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    pressRef.current = false;
    txRef.current = null;
    txChannelRef.current = null;
    pubsRef.current.clear();
    roomRef.current?.disconnect();
    roomRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    if (audioHostRef.current) audioHostRef.current.innerHTML = "";
    setTalking(false);
    setSpeakers({});
  }, []);

  useEffect(() => teardown, [teardown]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const j = await fetchJoin();
      if (j === "unavailable") { setUnavailable(true); setStatus("idle"); onUnavailable?.(); return; }
      setJoin(j);
      joinRef.current = j;
      ctxRef.current ??= new AudioContext();

      const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
      roomRef.current = room;

      const sync = () => refreshSubs();
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          audioHostRef.current?.appendChild(el);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        })
        .on(RoomEvent.TrackMuted, (pub, participant) => {
          // Race control's all-call cut us off server-side.
          if (
            participant === room.localParticipant &&
            txChannelRef.current &&
            pub.trackName === TRACK_PREFIX + txChannelRef.current
          ) {
            if (capTimerRef.current) clearTimeout(capTimerRef.current);
            txRef.current = null;
            txChannelRef.current = null;
            pressRef.current = false;
            setTalking(false);
            flash("Cut off by a race control all-call");
          }
          sync();
        })
        .on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => {
          if (s === ConnectionState.Reconnecting) setStatus("reconnecting");
          if (s === ConnectionState.Connected) { setStatus("live"); sync(); loadInstruction(); }
        })
        .on(RoomEvent.Disconnected, () => {
          teardown();
          setStatus("idle");
        });

      await room.connect(j.url, j.token, { autoSubscribe: false });
      await room.startAudio();

      const talk = j.channels.filter((c) => c.can_talk);
      if (talk.length) {
        const mic = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        micRef.current = mic;
        for (const c of talk) {
          const clone = mic.mediaStreamTrack.clone();
          clone.enabled = false; // never on air before the floor is granted
          const pub = await room.localParticipant.publishTrack(clone, {
            name: TRACK_PREFIX + c.id,
            source: Track.Source.Microphone,
            dtx: true,
            red: true,
            stopMicTrackOnMute: false,
          });
          await pub.mute();
          pubsRef.current.set(c.id, pub);
        }
      }

      setStatus("live");
      refreshSubs();
      loadInstruction();
    } catch (e) {
      teardown();
      setStatus("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setError(/permission|denied|NotAllowed/i.test(msg) ? "Microphone permission was blocked." : "Could not connect to the radio.");
    }
  }, [fetchJoin, refreshSubs, loadInstruction, teardown, flash, onUnavailable]);

  const stopTalk = useCallback(async () => {
    pressRef.current = false;
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    const tx = txRef.current;
    const ch = txChannelRef.current;
    txRef.current = null;
    txChannelRef.current = null;
    if (ch) await pubsRef.current.get(ch)?.mute();
    setTalking(false);
    if (tx) {
      endTone(ctxRef.current);
      fetch("/api/comms/floor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, action: "release", transmission_id: tx }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [token]);

  const startTalk = useCallback(async () => {
    if (pressRef.current || status !== "live" || !join) return;
    const rc = join.channels.find((c) => c.kind === "race_control");
    const ch = allCall ? rc?.id : talkChannel;
    if (!ch || !pubsRef.current.has(ch)) return;
    pressRef.current = true;

    let d: { granted?: boolean; reason?: string; holder?: string; error?: string; transmission_id?: string } = {};
    try {
      const res = await fetch("/api/comms/floor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, action: "request", channel_id: ch, priority: allCall }),
      });
      d = await res.json();
    } catch {
      d = { error: "network" };
    }

    if (!d.granted || !d.transmission_id) {
      pressRef.current = false;
      busyTone(ctxRef.current);
      flash(
        d.reason === "all_call" ? `All-call in progress — ${d.holder ?? "race control"}`
        : d.reason === "busy" ? `Busy — ${d.holder ?? "someone"} is talking`
        : d.error === "network" ? "No connection — not sent"
        : "You can't talk on this channel"
      );
      return;
    }

    txRef.current = d.transmission_id;
    txChannelRef.current = ch;
    if (!pressRef.current) { await stopTalk(); return; } // let go while waiting

    permitTone(ctxRef.current);
    await pubsRef.current.get(ch)?.unmute();
    setTalking(true);
    capTimerRef.current = setTimeout(() => {
      flash("Transmission limit reached");
      stopTalk();
    }, allCall ? 59_000 : 29_000);
  }, [status, join, allCall, talkChannel, token, flash, stopTalk]);

  // Hold Space to talk (not while typing in a field).
  useEffect(() => {
    if (status !== "live") return;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e)) return;
      e.preventDefault();
      startTalk();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      stopTalk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [status, startTalk, stopTalk]);

  const clearInstruction = async () => {
    if (!instruction) return;
    await fetch("/api/comms/instruction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action: "clear", transmission_id: instruction.transmission_id }),
    }).catch(() => {});
    loadInstruction();
  };

  if (unavailable || (!join && !error)) return null;

  const isControl = join?.role === "control";
  const channels = join?.channels ?? [];
  const talkable = channels.filter((c) => c.can_talk);
  const target = allCall ? channels.find((c) => c.kind === "race_control") : channels.find((c) => c.id === talkChannel);
  const dot = status === "live" ? theme.live : status === "idle" ? theme.faint : theme.warn;
  const isPage = layout === "page";

  return (
    <div
      style={{
        ...(isPage
          ? { position: "relative", width: "100%" }
          : { position: "absolute", right: 12, bottom: 12, zIndex: 7, width: 300, maxWidth: "calc(100% - 24px)" }),
        background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 8,
        boxShadow: "0 8px 28px rgba(0,0,0,.55)", font: `${text.base}px ${font.sans}`, color: theme.body,
      }}
    >
      <div ref={audioHostRef} style={{ display: "none" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: collapsed ? "none" : `1px solid ${theme.hairline}` }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: dot }} />
        <span style={{ font: `700 ${text.sm}px ${font.sans}`, letterSpacing: 1, textTransform: "uppercase", color: theme.ink }}>Radio</span>
        <span style={{ fontSize: text.xs, color: theme.muted }}>
          {status === "live" ? "live" : status === "reconnecting" ? "reconnecting…" : status === "connecting" ? "connecting…" : "off"}
        </span>
        {!isPage && <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: theme.muted, cursor: "pointer", fontSize: text.xs }}
        >
          {collapsed ? "Show" : "Hide"}
        </button>}
      </div>

      {!collapsed && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {status === "idle" || status === "connecting" ? (
            <>
              <button
                onClick={connect}
                disabled={status === "connecting" || !join}
                style={{
                  background: "#CCFF00", color: theme.accentInk, border: "none", borderRadius: 6, padding: "10px 14px",
                  font: `700 ${text.base}px ${font.sans}`, cursor: status === "connecting" ? "default" : "pointer",
                  opacity: status === "connecting" ? 0.6 : 1,
                }}
              >
                {status === "connecting" ? "Connecting…" : "Join radio"}
              </button>
              <div style={{ fontSize: text.xs, color: theme.muted }}>
                Live audio. Your browser will ask for the microphone{talkable.length ? "" : " (listen-only link)"}.
              </div>
              {error && <div style={{ fontSize: text.xs, color: theme.danger }}>{error}</div>}
            </>
          ) : (
            <>
              {instruction && (
                <div style={{ background: theme.surfaceHi, borderLeft: `3px solid ${theme.accent}`, borderRadius: 4, padding: "6px 8px", fontSize: text.xs, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ flex: 1 }}>
                    Last all-call · <b style={{ color: theme.ink }}>{instruction.speaker}</b> · {ago(instruction.age_s)}
                  </span>
                  {isControl && (
                    <button onClick={clearInstruction} style={{ background: "none", border: `1px solid ${theme.hairline}`, color: theme.body, borderRadius: 4, padding: "2px 6px", fontSize: text.xxs, cursor: "pointer" }}>
                      Clear
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {channels.map((c) => {
                  const on = !listenOff.has(c.id);
                  const speaker = speakers[c.id];
                  const selected = !allCall && talkChannel === c.id;
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4,
                        background: selected ? theme.surfaceHi : "transparent",
                        border: `1px solid ${selected ? theme.hairline : "transparent"}`,
                      }}
                    >
                      <button
                        onClick={() => c.can_talk && !allCall && setTalkChannel(c.id)}
                        disabled={!c.can_talk || allCall}
                        title={c.can_talk ? "Talk on this channel" : "Listen only"}
                        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: c.can_talk && !allCall ? "pointer" : "default", color: on ? theme.ink : theme.faint, font: `600 ${text.sm}px ${font.sans}` }}
                      >
                        {c.name}
                        {speaker ? (
                          <span style={{ marginLeft: 6, color: theme.live, fontWeight: 700, fontSize: text.xs }}>● {speaker}</span>
                        ) : !c.can_talk ? (
                          <span style={{ marginLeft: 6, color: theme.faint, fontWeight: 400, fontSize: text.xxs }}>listen</span>
                        ) : null}
                      </button>
                      <button
                        onClick={() =>
                          setListenOff((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                            return next;
                          })
                        }
                        title={on ? "Mute this channel" : "Listen to this channel"}
                        style={{ background: "none", border: `1px solid ${theme.hairline}`, borderRadius: 4, color: on ? theme.body : theme.faint, fontSize: text.xxs, padding: "2px 6px", cursor: "pointer" }}
                      >
                        {on ? "On" : "Off"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {isControl && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: text.xs, color: allCall ? theme.warn : theme.muted, cursor: "pointer" }}>
                  <input type="checkbox" checked={allCall} onChange={(e) => setAllCall(e.target.checked)} />
                  All-call (cuts in on every channel)
                </label>
              )}

              {talkable.length > 0 ? (
                <button
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startTalk(); }}
                  onPointerUp={() => stopTalk()}
                  onPointerCancel={() => stopTalk()}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={status !== "live"}
                  style={{
                    userSelect: "none", touchAction: "none",
                    background: talking ? theme.danger : allCall ? theme.warn : "#CCFF00",
                    color: talking ? "#fff" : theme.accentInk,
                    border: "none", borderRadius: 8, padding: isPage ? "34px 12px" : "16px 12px",
                    font: `800 ${text.md}px ${font.sans}`, cursor: "pointer",
                  }}
                >
                  {talking ? "ON AIR — release to stop" : `Hold to talk · ${target?.name ?? "—"}`}
                  <div style={{ font: `500 ${text.xxs}px ${font.sans}`, opacity: 0.75, marginTop: 2 }}>
                    {talking ? "" : isPage ? "press and hold" : "or hold Space"}
                  </div>
                </button>
              ) : (
                <div style={{ fontSize: text.xs, color: theme.muted }}>Listen-only link.</div>
              )}

              {notice && <div style={{ fontSize: text.xs, color: theme.warn }}>{notice}</div>}

              <button
                onClick={() => { teardown(); setStatus("idle"); }}
                style={{ alignSelf: "flex-start", background: "none", border: "none", color: theme.muted, fontSize: text.xs, cursor: "pointer", padding: 0 }}
              >
                Leave radio
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
