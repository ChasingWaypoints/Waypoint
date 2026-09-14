import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Share, Platform,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";
import {
  startBeacon, stopBeacon, getBeaconStatus, syncNow, resumeBeacon,
  getFailedStartStep, getFailedTaskStep, clearFailedStartStep,
  type Tier,
} from "../../lib/backgroundTracking";
import {
  registerDevice, fetchBeaconState, fetchBeaconEvents, setBeaconEvent,
  claimUrlFor, getCachedClaimCode, releaseRosterRow, rosterClaimMessage,
  type BeaconState, type BeaconEvent,
} from "../../lib/deviceIdentity";
import RosterClaim from "../../components/RosterClaim";
import {
  needsBatteryGuidance, hasAcknowledged, acknowledge, openBatterySettings,
  BATTERY_GUIDANCE_TITLE, BATTERY_GUIDANCE_BODY,
} from "../../lib/batteryGuidance";

/**
 * The single tracking screen.
 *
 * It used to take two screens and a web page to get from "installed" to
 * "sharing my position": claim under Settings, pick an event there, then come
 * here for the rate and START. A rider could do every step correctly and still
 * not appear on the map, because starting a personal ride first required going
 * to a third screen to make a trip.
 *
 * So this screen asks three questions in order and hides the ones already
 * answered: is this phone linked, what is this ride for, and how often.
 */

const TIER_OPTIONS: { label: string; value: Tier; detail: string }[] = [
  { label: "Race", value: "race", detail: "30 sec" },
  { label: "Trail", value: "trail", detail: "1 min" },
  { label: "Idle", value: "idle", detail: "5 min" },
  { label: "Parked", value: "parked", detail: "15 min" },
];

/** null = personal ride */
type Destination = { kind: "event"; event: BeaconEvent } | { kind: "personal" };

function formatAge(ms: number | null): string {
  if (ms == null) return "not yet";
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function TrackScreen() {
  const [loading, setLoading] = useState(true);
  const [beacon, setBeacon] = useState<BeaconState | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [events, setEvents] = useState<BeaconEvent[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);

  const [tracking, setTracking] = useState(false);
  const [tier, setTier] = useState<Tier>("trail");
  const [queued, setQueued] = useState(0);
  const [lastFixAgeMs, setLastFixAgeMs] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  const [failedStep, setFailedStep] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showBattery, setShowBattery] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Loading ────────────────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    const s = await getBeaconStatus();
    setTracking(s.active);
    setQueued(s.queued);
    setStalled(s.stalled);
    setLastFixAgeMs(s.lastFixAgeMs);
    if (s.active) setTier(s.tier);
  }, []);

  const loadBeacon = useCallback(async () => {
    try {
      const registered = await registerDevice();
      setCode(registered ?? (await getCachedClaimCode()));

      const s = await fetchBeaconState();
      setBeacon(s);
      if (s.ok && s.claim_code) setCode(s.claim_code);

      if (s.claimed) {
        const evs = await fetchBeaconEvents();
        setEvents(evs);
        const active = s.active_event_id
          ? evs.find((e) => e.event_id === s.active_event_id)
          : undefined;
        setDestination(active ? { kind: "event", event: active } : { kind: "personal" });
      }
    } catch {
      // Offline is survivable — a running session keeps running.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await Promise.all([refreshStatus(), loadBeacon()]);
        if (alive) setLoading(false);
      })();

      if (needsBatteryGuidance()) hasAcknowledged().then((ack) => setShowBattery(!ack));
      Promise.all([getFailedStartStep(), getFailedTaskStep()]).then(([a, b]) =>
        setFailedStep(a ? `start: ${a}` : b ? `tracking: ${b}` : null)
      );

      pollRef.current = setInterval(refreshStatus, 5000);
      return () => {
        alive = false;
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [refreshStatus, loadBeacon])
  );

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function copyCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function chooseEvent(ev: BeaconEvent) {
    setBusy(true); setError("");
    const r = await setBeaconEvent(ev.event_id);
    if (!r.ok) {
      setError(
        r.error === "not_an_entrant"
          ? "You're not on that event's roster yet — ask the organizer to add you."
          : r.error ?? "Could not select that event."
      );
    } else {
      setDestination({ kind: "event", event: ev });
    }
    await loadBeacon();
    setBusy(false);
  }

  async function choosePersonal() {
    setBusy(true); setError("");
    const r = await setBeaconEvent(null);
    if (!r.ok) setError(r.error ?? "Could not switch to a personal ride.");
    else setDestination({ kind: "personal" });
    await loadBeacon();
    setBusy(false);
  }

  /**
   * "Not you?" — releases the roster row this account claimed, so a wrong
   * rider number is a ten-second fix rather than a call to the organizer from
   * the start line. The row goes back exactly as it was imported.
   */
  async function unlinkEvent(ev: BeaconEvent) {
    setBusy(true); setError("");
    const r = await releaseRosterRow(ev.event_id);
    if (!r.ok) setError(rosterClaimMessage(r.error));
    else setDestination({ kind: "personal" });
    await loadBeacon();
    setBusy(false);
  }

  /**
   * A personal ride needs a trip to write into. Reuse an active one if there is
   * one, otherwise make it here — the old app made the rider go to another tab
   * to do this, which is where the first field test stopped.
   */
  async function ensurePersonalTrip(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to record a personal ride.");

    const { data: existing } = await supabase
      .from("trips")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const name = new Date().toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
    const { data, error: err } = await supabase
      .from("trips")
      .insert({ user_id: user.id, name: `Ride — ${name}`, status: "active", is_public: false })
      .select("id")
      .single();
    if (err) throw new Error(err.message);
    return data!.id as string;
  }

  async function handleStart() {
    setError("");
    if (!destination) { setError("Pick what this ride is for first."); return; }
    setBusy(true);
    try {
      if (destination.kind === "event") {
        await startBeacon(
          {
            mode: "event",
            eventId: destination.event.event_id,
            participantId: destination.event.participant_id,
            eventName: destination.event.name,
          },
          tier
        );
      } else {
        const tripId = await ensurePersonalTrip();
        await startBeacon({ mode: "trip", tripId }, tier);
      }
      await refreshStatus();
      setFailedStep(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not start tracking.");
    }
    setBusy(false);
  }

  async function handleStop() {
    setBusy(true);
    try { await stopBeacon(); } catch (e: any) { setError(e?.message ?? "Could not stop."); }
    await refreshStatus();
    setBusy(false);
  }

  async function handleSync() {
    setBusy(true);
    try {
      const r = await syncNow();
      setQueued(r.remaining);
      setError(r.skipped === "offline" ? "No connection — points are safe on the phone." : "");
    } finally { setBusy(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 bg-surface-dark items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const claimed = !!beacon?.claimed;

  // ── 1. Not linked yet: nothing else matters ────────────────────────────────
  if (!claimed) {
    return (
      <ScrollView className="flex-1 bg-surface-dark" contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text className="text-white text-xl font-bold mb-2">Link this phone</Text>
        <Text className="text-on-dark-soft text-sm mb-6 leading-5">
          Go to waypointtracking.com/claim on any device, sign in, and enter this code.
          You only do this once.
        </Text>

        <View className="bg-surface-dark-elevated rounded-xl p-6 items-center mb-4">
          <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3">Your code</Text>
          <Text className="text-white text-4xl font-bold tracking-[8px] mb-5">{code ?? "······"}</Text>

          {code ? (
            <View className="bg-white p-3 rounded-lg mb-4">
              <QRCode value={claimUrlFor(code)} size={150} />
            </View>
          ) : null}

          <View className="flex-row gap-2">
            <TouchableOpacity className="bg-primary rounded-lg px-5 py-3" onPress={copyCode} disabled={!code}>
              <Text className="text-on-primary font-bold text-sm">{copied ? "Copied" : "Copy code"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface-dark rounded-lg px-5 py-3"
              onPress={() => code && Share.share({ message: claimUrlFor(code) })}
              disabled={!code}
            >
              <Text className="text-on-dark font-bold text-sm">Share link</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          className="rounded-xl py-4 items-center bg-surface-dark-elevated"
          onPress={async () => { setLoading(true); await loadBeacon(); setLoading(false); }}
        >
          <Text className="text-on-dark font-bold text-sm">I've claimed it — check again</Text>
        </TouchableOpacity>

        {error ? <Text className="text-red-400 text-sm mt-4">{error}</Text> : null}
      </ScrollView>
    );
  }

  // ── 2 + 3. Linked: destination, rate, start ────────────────────────────────
  return (
    <ScrollView className="flex-1 bg-surface-dark" contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>

      {/* Recovery: last attempt never finished */}
      {failedStep && !tracking && (
        <View className="bg-red-500/15 border border-red-500/40 rounded-xl p-4 mb-5">
          <Text className="text-red-300 font-bold text-sm mb-1">Last attempt didn't finish</Text>
          <Text className="text-on-dark-soft text-xs leading-5 mb-3">
            It stopped at <Text className="text-white font-bold">{failedStep}</Text>. Send that to support.
          </Text>
          <TouchableOpacity
            className="bg-surface-dark-elevated rounded-lg px-4 py-2 self-start"
            onPress={async () => { await clearFailedStartStep(); setFailedStep(null); }}
          >
            <Text className="text-on-dark font-bold text-sm">Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tracking stopped without saying so */}
      {stalled && (
        <View className="bg-red-500/15 border border-red-500/40 rounded-xl p-4 mb-5">
          <Text className="text-red-300 font-bold text-sm mb-1">Tracking stopped</Text>
          <Text className="text-on-dark-soft text-xs leading-5 mb-3">
            {tracking
              ? `No fix for ${formatAge(lastFixAgeMs)}. Your phone may have put Waypoint to sleep.`
              : "The session is still set but the phone isn't tracking."}
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              className="bg-primary rounded-lg px-4 py-2"
              onPress={async () => { try { await resumeBeacon(); await refreshStatus(); } catch (e: any) { setError(e?.message ?? ""); } }}
            >
              <Text className="text-on-primary font-bold text-sm">Resume</Text>
            </TouchableOpacity>
            {needsBatteryGuidance() && (
              <TouchableOpacity className="bg-surface-dark-elevated rounded-lg px-4 py-2" onPress={openBatterySettings}>
                <Text className="text-on-dark font-bold text-sm">Battery settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* One-time Android nudge */}
      {showBattery && !stalled && (
        <View className="bg-surface-dark-elevated border border-amber-500/30 rounded-xl p-4 mb-5">
          <Text className="text-amber-300 font-bold text-sm mb-1">{BATTERY_GUIDANCE_TITLE}</Text>
          <Text className="text-on-dark-soft text-xs leading-5 mb-3">{BATTERY_GUIDANCE_BODY}</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity className="bg-primary rounded-lg px-4 py-2" onPress={openBatterySettings}>
              <Text className="text-on-primary font-bold text-sm">Open settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface-dark rounded-lg px-4 py-2"
              onPress={async () => { await acknowledge(); setShowBattery(false); }}
            >
              <Text className="text-on-dark-soft font-bold text-sm">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Live status, only while running */}
      {tracking && (
        <View className="bg-primary/20 rounded-xl p-5 mb-5 items-center">
          <View className="w-3 h-3 rounded-full mb-3 bg-primary" />
          <Text className="text-primary text-lg font-bold mb-1">Tracking</Text>
          <Text className="text-on-dark text-sm text-center">
            {destination?.kind === "event"
              ? `You're on the map for ${destination.event.name}`
              : "Recording a personal ride"}
          </Text>
          <Text className="text-on-dark-soft text-xs mt-2">Last fix {formatAge(lastFixAgeMs)}</Text>
        </View>
      )}

      {/* Queue — proof nothing was lost */}
      {(queued > 0 || tracking) && (
        <View className="bg-surface-dark-elevated rounded-xl p-4 mb-5 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-on-dark-soft text-xs uppercase font-bold mb-1">Waiting to upload</Text>
            <Text className="text-white text-base font-semibold">
              {queued === 0 ? "All caught up" : `${queued} point${queued === 1 ? "" : "s"} queued`}
            </Text>
            {queued > 0 && (
              <Text className="text-on-dark-soft text-xs mt-1">
                Saved on this phone. They upload as soon as you have signal.
              </Text>
            )}
          </View>
          <TouchableOpacity
            className={`rounded-lg px-4 py-2 ${queued > 0 ? "bg-primary" : "bg-surface-dark"}`}
            onPress={handleSync}
            disabled={busy || queued === 0}
          >
            <Text className={`font-bold text-sm ${queued > 0 ? "text-on-primary" : "text-on-dark-soft"}`}>Sync</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── What is this ride for? ── */}
      {!tracking && (
        <>
          <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3">What is this ride for?</Text>

          {events.map((ev) => {
            const active = destination?.kind === "event" && destination.event.event_id === ev.event_id;
            return (
              <TouchableOpacity
                key={ev.event_id}
                className={`rounded-xl p-4 mb-2 ${active ? "bg-primary" : "bg-surface-dark-elevated"}`}
                onPress={() => chooseEvent(ev)}
                disabled={busy}
              >
                <Text className={`font-semibold ${active ? "text-on-primary" : "text-on-dark"}`} numberOfLines={2}>
                  {ev.name}
                </Text>
                <Text className={`text-xs mt-0.5 ${active ? "text-on-primary" : "text-on-dark-soft"}`}>
                  {ev.rider_number ? `#${ev.rider_number} · ` : ""}
                  {ev.status ?? "scheduled"}
                </Text>

                {active && (
                  <TouchableOpacity
                    className="mt-3 self-start rounded-lg bg-surface-dark px-3 py-2"
                    onPress={() => unlinkEvent(ev)}
                    disabled={busy}
                  >
                    <Text className="text-on-dark-soft text-xs font-bold">Not you? Unlink</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            className={`rounded-xl p-4 mb-2 ${destination?.kind === "personal" ? "bg-primary" : "bg-surface-dark-elevated"}`}
            onPress={choosePersonal}
            disabled={busy}
          >
            <Text className={`font-semibold ${destination?.kind === "personal" ? "text-on-primary" : "text-on-dark"}`}>
              Personal ride
            </Text>
            <Text className={`text-xs mt-0.5 ${destination?.kind === "personal" ? "text-on-primary" : "text-on-dark-soft"}`}>
              Private history — not on any event map
            </Text>
          </TouchableOpacity>

          {/* The gap this closes: a CSV import links a roster row to an account
              only when the file carries a Waypoint ID, which registration
              rarely produces. Without this the event never appears above, and
              nothing on screen says why. */}
          <RosterClaim onLinked={loadBeacon} />

          {events.length === 0 && (
            <Text className="text-on-dark-soft text-xs mt-1 mb-1 leading-5">
              Entered in an event but don't see it? Use the event code above. Otherwise it appears
              here as soon as the organizer adds you.
            </Text>
          )}

          {/* ── How often? ── */}
          <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3 mt-6">How often?</Text>
          <View className="flex-row gap-2 flex-wrap">
            {TIER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setTier(opt.value)}
                className={`flex-1 rounded-xl p-3 items-center min-w-16 ${tier === opt.value ? "bg-primary" : "bg-surface-dark-elevated"}`}
              >
                <Text className={`font-bold text-sm ${tier === opt.value ? "text-on-primary" : "text-on-dark"}`}>
                  {opt.label}
                </Text>
                <Text className={`text-xs mt-0.5 ${tier === opt.value ? "text-on-primary" : "text-on-dark-soft"}`}>
                  {opt.detail}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-on-dark-soft text-xs mt-3 leading-5">
            Waypoint slows down on its own when you stop moving, and speeds back up when you ride.
          </Text>
        </>
      )}

      {error ? <Text className="text-red-400 text-sm mt-4">{error}</Text> : null}

      {/* ── Start / Stop ── */}
      <TouchableOpacity
        className={`rounded-xl py-5 items-center mt-6 ${tracking ? "bg-red-500/80" : "bg-primary"}`}
        onPress={tracking ? handleStop : handleStart}
        disabled={busy}
      >
        <Text className={`font-bold text-lg ${tracking ? "text-white" : "text-on-primary"}`}>
          {busy ? "…" : tracking ? "Stop Tracking" : "Start Tracking"}
        </Text>
      </TouchableOpacity>

      {/* Linked account, quietly at the bottom */}
      <Text className="text-muted-soft text-xs text-center mt-6">
        Linked to {beacon?.owner_name?.trim() || "your Waypoint account"} · {code}
      </Text>

      {Platform.OS === "web" && (
        <Text className="text-on-dark-soft text-xs text-center mt-3">
          GPS is limited in a browser. Install the app for background tracking.
        </Text>
      )}
    </ScrollView>
  );
}
