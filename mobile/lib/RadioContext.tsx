/**
 * RadioContext — one live radio connection for the whole app.
 *
 * Lives above the tab bar so switching to Map or Track never drops the radio.
 * Port of the web CommsPanel with one difference: instead of a muted mic track
 * per channel (which needs track cloning that react-native-webrtc can't be
 * relied on for), the phone publishes ONE mic track named for the channel it
 * talks on, and republishes when the rider switches channel. Listening is by
 * subscription to `ch:<id>` tracks on the channels this person may hear.
 *
 * Talk flow: hold → ask the server for the floor → unmute only if granted →
 * release on let-go (or at the 30 s cap). Buzz on grant, double-buzz on busy.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import {
  ensureMicPermission,
  fetchInstruction,
  fetchRadioJoin,
  forgetStaffRadio,
  getStaffRadio,
  redeemStaffCode,
  releaseFloor,
  requestFloor,
  type Instruction,
  type RadioJoin,
  type StaffRadio,
} from "./radio";

const TRACK_PREFIX = "ch:";
const AUTO_KEY = "waypoint.radio.auto";
const chanOf = (name?: string) => (name && name.startsWith(TRACK_PREFIX) ? name.slice(TRACK_PREFIX.length) : null);

export type RadioStatus = "checking" | "unavailable" | "idle" | "connecting" | "live" | "reconnecting";

type RadioState = {
  status: RadioStatus;
  /** Server reason when unavailable: comms_disabled, invalid_token, event_closed, no_event… */
  reason: string | null;
  join: RadioJoin | null;
  staff: StaffRadio | null;
  talkChannel: string | null;
  allCall: boolean;
  listenOff: Set<string>;
  speakers: Record<string, string>;
  talking: boolean;
  notice: string | null;
  instruction: Instruction;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  recheck: () => Promise<void>;
  startTalk: () => Promise<void>;
  stopTalk: () => Promise<void>;
  setTalkChannel: (id: string) => void;
  setAllCall: (on: boolean) => void;
  toggleListen: (id: string) => void;
  redeem: (code: string, name: string) => Promise<string | null>;
  signOutStaff: () => Promise<void>;
};

const Ctx = createContext<RadioState | null>(null);

export function useRadio(): RadioState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRadio must be used inside RadioProvider");
  return v;
}

async function startAudio() {
  if (Platform.OS === "web") return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioSession, AndroidAudioTypePresets } = require("@livekit/react-native");
  if (Platform.OS === "android") {
    await AudioSession.configureAudio({
      android: {
        // Helmet headset first; never the earpiece — the phone is on the bars.
        preferredOutputList: ["bluetooth", "headset", "speaker"],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
    });
  } else {
    await AudioSession.configureAudio({ ios: { defaultOutput: "speaker" } });
  }
  await AudioSession.startAudioSession();
}

async function stopAudio() {
  if (Platform.OS === "web") return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioSession } = require("@livekit/react-native");
  await AudioSession.stopAudioSession();
}

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RadioStatus>("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [join, setJoin] = useState<RadioJoin | null>(null);
  const [staff, setStaff] = useState<StaffRadio | null>(null);
  const [talkChannel, setTalkChannelState] = useState<string | null>(null);
  const [allCall, setAllCallState] = useState(false);
  const [listenOff, setListenOff] = useState<Set<string>>(new Set());
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [talking, setTalking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<Instruction>(null);
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<{ channelId: string; pub: LocalTrackPublication; track: LocalAudioTrack } | null>(null);
  const joinRef = useRef<RadioJoin | null>(null);
  const listenOffRef = useRef<Set<string>>(listenOff);
  const pressRef = useRef(false);
  const txRef = useRef<string | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { joinRef.current = join; }, [join]);
  useEffect(() => { listenOffRef.current = listenOff; }, [listenOff]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  const refreshSubs = useCallback(() => {
    const room = roomRef.current;
    const j = joinRef.current;
    if (!room || !j) return;
    const known = new Set(j.channels.map((c) => c.id));
    const live: Record<string, string> = {};
    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      p.trackPublications.forEach((pub: RemoteTrackPublication) => {
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
    setInstruction(await fetchInstruction());
  }, []);

  /** Is radio available for this phone right now? (No connection, no mic.) */
  const recheck = useCallback(async () => {
    if (roomRef.current) return;
    setStaff(await getStaffRadio());
    try {
      const j = await fetchRadioJoin();
      if ("unavailable" in j) {
        setJoin(null);
        setReason(j.unavailable);
        setStatus("unavailable");
        return;
      }
      setJoin(j);
      setReason(null);
      setTalkChannelState((cur) => {
        if (cur && j.channels.some((c) => c.id === cur && c.can_talk)) return cur;
        const rc = j.channels.find((c) => c.can_talk && c.kind === "race_control");
        const cls = j.channels.find((c) => c.can_talk && c.kind === "class");
        // Riders default to their class channel; staff and control to Race Control.
        return (j.role === "rider" ? cls ?? rc : rc)?.id ?? j.channels.find((c) => c.can_talk)?.id ?? null;
      });
      setStatus("idle");
    } catch {
      setReason("offline");
      setStatus("unavailable");
    }
  }, []);

  const teardown = useCallback(() => {
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    pressRef.current = false;
    txRef.current = null;
    micRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    room?.disconnect();
    stopAudio().catch(() => {});
    setTalking(false);
    setSpeakers({});
  }, []);

  /** One mic track, named for the channel this phone talks on. */
  const publishMic = useCallback(async (room: Room, channelId: string) => {
    const cur = micRef.current;
    if (cur?.channelId === channelId) return;
    if (cur) {
      micRef.current = null;
      await room.localParticipant.unpublishTrack(cur.track, true).catch(() => {});
    }
    const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    await track.mute(); // never on air before the floor is granted
    const pub = await room.localParticipant.publishTrack(track, {
      name: TRACK_PREFIX + channelId,
      source: Track.Source.Microphone,
      dtx: true,
      red: true,
    });
    micRef.current = { channelId, pub, track };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const j = await fetchRadioJoin();
      if ("unavailable" in j) {
        setReason(j.unavailable);
        setStatus("unavailable");
        return;
      }
      setJoin(j);
      joinRef.current = j;
      const canTalk = j.channels.some((c) => c.can_talk);
      if (canTalk && !(await ensureMicPermission())) {
        setError("Microphone permission is off. You can listen; turn it on in Settings to talk.");
      }
      await startAudio();

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      const sync = () => refreshSubs();
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.TrackPublished, sync)
        .on(RoomEvent.TrackUnpublished, sync)
        .on(RoomEvent.TrackUnmuted, sync)
        .on(RoomEvent.TrackMuted, (pub, participant) => {
          if (participant === room.localParticipant && txRef.current && pub === micRef.current?.pub) {
            // Race control's all-call cut us off server-side.
            if (capTimerRef.current) clearTimeout(capTimerRef.current);
            txRef.current = null;
            pressRef.current = false;
            setTalking(false);
            Vibration.vibrate([0, 60, 80, 60]);
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
      setStatus("live");
      refreshSubs();
      loadInstruction();
      AsyncStorage.setItem(AUTO_KEY, "1").catch(() => {});
    } catch {
      teardown();
      setStatus("idle");
      setError("Could not connect to the radio. Check signal and try again.");
    }
  }, [refreshSubs, loadInstruction, teardown, flash]);

  const disconnect = useCallback(() => {
    AsyncStorage.removeItem(AUTO_KEY).catch(() => {});
    teardown();
    setStatus(joinRef.current ? "idle" : "unavailable");
  }, [teardown]);

  // Keep the mic track on the channel we'd talk on (only while not talking).
  const effectiveChannel = useMemo(() => {
    if (!join) return null;
    if (allCall) return join.channels.find((c) => c.kind === "race_control")?.id ?? null;
    return talkChannel;
  }, [join, allCall, talkChannel]);

  useEffect(() => {
    const room = roomRef.current;
    if (status !== "live" || !room || !effectiveChannel || talking) return;
    publishMic(room, effectiveChannel).catch(() => flash("Microphone unavailable"));
  }, [status, effectiveChannel, talking, publishMic, flash]);

  const stopTalk = useCallback(async () => {
    pressRef.current = false;
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    const tx = txRef.current;
    txRef.current = null;
    await micRef.current?.pub.mute().catch(() => {});
    setTalking(false);
    if (tx) releaseFloor(tx);
  }, []);

  const startTalk = useCallback(async () => {
    if (pressRef.current || status !== "live" || !effectiveChannel) return;
    if (micRef.current?.channelId !== effectiveChannel) {
      flash("Switching channel… try again");
      return;
    }
    pressRef.current = true;
    const d = await requestFloor(effectiveChannel, allCall);
    if (!d.granted || !d.transmission_id) {
      pressRef.current = false;
      Vibration.vibrate([0, 40, 60, 40, 60, 40]);
      flash(
        d.reason === "all_call" ? `All-call in progress — ${d.holder ?? "race control"}`
        : d.reason === "busy" ? `Busy — ${d.holder ?? "someone"} is talking`
        : d.error === "network" ? "No signal — not sent"
        : "You can't talk on this channel"
      );
      return;
    }
    txRef.current = d.transmission_id;
    if (!pressRef.current) { await stopTalk(); return; } // let go while waiting
    Vibration.vibrate(40);
    await micRef.current?.pub.unmute();
    setTalking(true);
    capTimerRef.current = setTimeout(() => {
      flash("Transmission limit reached");
      stopTalk();
    }, allCall ? 59_000 : 29_000);
  }, [status, effectiveChannel, allCall, flash, stopTalk]);

  const setTalkChannel = useCallback((id: string) => { if (!talking) setTalkChannelState(id); }, [talking]);
  const setAllCall = useCallback((on: boolean) => { if (!talking) setAllCallState(on); }, [talking]);
  const toggleListen = useCallback((id: string) => {
    setListenOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const redeem = useCallback(async (code: string, name: string) => {
    const r = await redeemStaffCode(code, name);
    if ("error" in r) return r.error;
    teardown();
    setStaff(r);
    await recheck();
    return null;
  }, [teardown, recheck]);

  const signOutStaff = useCallback(async () => {
    teardown();
    await forgetStaffRadio();
    setStaff(null);
    setAllCallState(false);
    await recheck();
  }, [teardown, recheck]);

  // First look on launch; reconnect automatically if the rider had radio on.
  useEffect(() => {
    let alive = true;
    (async () => {
      await recheck();
      const auto = await AsyncStorage.getItem(AUTO_KEY).catch(() => null);
      if (alive && auto === "1" && joinRef.current) connect();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the app: re-check availability and refresh the banner.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      if (roomRef.current) loadInstruction();
      else recheck();
    });
    return () => sub.remove();
  }, [recheck, loadInstruction]);

  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(loadInstruction, 60_000);
    return () => clearInterval(t);
  }, [status, loadInstruction]);

  useEffect(() => teardown, [teardown]);

  const value: RadioState = {
    status, reason, join, staff, talkChannel, allCall, listenOff, speakers, talking, notice, instruction, error,
    connect, disconnect, recheck, startTalk, stopTalk, setTalkChannel, setAllCall, toggleListen, redeem, signOutStaff,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
