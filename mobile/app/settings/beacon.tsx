import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Share,
} from "react-native";
import { useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import {
  registerDevice,
  fetchBeaconState,
  fetchBeaconEvents,
  setBeaconEvent,
  claimUrlFor,
  getCachedClaimCode,
  type BeaconState,
  type BeaconEvent,
} from "../../lib/deviceIdentity";

export default function BeaconSetupScreen() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<BeaconState | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [events, setEvents] = useState<BeaconEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const registered = await registerDevice();
      setCode(registered ?? (await getCachedClaimCode()));
      const s = await fetchBeaconState();
      setState(s);
      if (s.ok && s.claim_code) setCode(s.claim_code);
      if (s.claimed) setEvents(await fetchBeaconEvents());
    } catch (e: any) {
      setError(e?.message ?? "Could not reach Waypoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function copyCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function chooseEvent(eventId: string | null) {
    setBusy(true);
    setError("");
    const r = await setBeaconEvent(eventId);
    if (!r.ok) {
      setError(
        r.error === "not_an_entrant"
          ? "You're not on that event's roster yet — ask the organizer to add you."
          : r.error ?? "Could not set the event."
      );
    }
    await load();
    setBusy(false);
  }

  if (loading) {
    return (
      <View className="flex-1 bg-surface-dark items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const claimed = !!state?.claimed;

  return (
    <ScrollView className="flex-1 bg-surface-dark">
      <View className="px-6 pt-6 pb-10">

        {/* ── Claim status ─────────────────────────────────────────── */}
        {!claimed ? (
          <>
            <Text className="text-white text-xl font-bold mb-2">
              Link this phone
            </Text>
            <Text className="text-on-dark-soft text-sm mb-6">
              Go to waypointtracking.com/claim on any device, sign in, and enter
              this code. You only do this once.
            </Text>

            <View className="bg-surface-dark-elevated rounded-xl p-6 items-center mb-4">
              <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3">
                Your code
              </Text>
              <Text className="text-white text-4xl font-bold tracking-[8px] mb-5">
                {code ?? "······"}
              </Text>

              {code ? (
                <View className="bg-white p-3 rounded-lg mb-4">
                  <QRCode value={claimUrlFor(code)} size={150} />
                </View>
              ) : null}

              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-primary rounded-lg px-5 py-3"
                  onPress={copyCode}
                  disabled={!code}
                >
                  <Text className="text-on-primary font-bold text-sm">
                    {copied ? "Copied" : "Copy code"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-surface-dark rounded-lg px-5 py-3"
                  onPress={() =>
                    code && Share.share({ message: claimUrlFor(code) })
                  }
                  disabled={!code}
                >
                  <Text className="text-on-dark font-bold text-sm">Share link</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              className="rounded-xl py-4 items-center bg-surface-dark-elevated"
              onPress={load}
            >
              <Text className="text-on-dark font-bold text-sm">
                I've claimed it — check again
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View className="bg-surface-dark-elevated rounded-xl p-4 mb-5">
              <Text className="text-on-dark-soft text-xs uppercase font-bold mb-1">
                Linked to
              </Text>
              <Text className="text-white text-base font-semibold">
                {state?.owner_name?.trim() || "Your Waypoint account"}
              </Text>
              <Text className="text-on-dark-soft text-xs mt-1">
                Device code {code}
              </Text>
            </View>

            {/* ── Event selection ──────────────────────────────────── */}
            <Text className="text-on-dark-soft text-xs uppercase font-bold mb-3">
              Feed this phone to
            </Text>

            <TouchableOpacity
              className={`rounded-xl p-4 mb-2 ${
                !state?.active_event_id ? "bg-primary" : "bg-surface-dark-elevated"
              }`}
              onPress={() => chooseEvent(null)}
              disabled={busy}
            >
              <Text
                className={`font-semibold ${
                  !state?.active_event_id ? "text-on-primary" : "text-on-dark"
                }`}
              >
                Personal trip
              </Text>
              <Text
                className={`text-xs mt-0.5 ${
                  !state?.active_event_id ? "text-emerald-100" : "text-on-dark-soft"
                }`}
              >
                Private ride history — not on any event map
              </Text>
            </TouchableOpacity>

            {events.map((ev) => {
              const active = state?.active_event_id === ev.event_id;
              return (
                <TouchableOpacity
                  key={ev.event_id}
                  className={`rounded-xl p-4 mb-2 ${
                    active ? "bg-primary" : "bg-surface-dark-elevated"
                  }`}
                  onPress={() => chooseEvent(ev.event_id)}
                  disabled={busy}
                >
                  <Text
                    className={`font-semibold ${active ? "text-on-primary" : "text-on-dark"}`}
                  >
                    {ev.name}
                  </Text>
                  <Text
                    className={`text-xs mt-0.5 ${
                      active ? "text-emerald-100" : "text-on-dark-soft"
                    }`}
                  >
                    {ev.rider_number ? `#${ev.rider_number} · ` : ""}
                    {ev.status ?? "scheduled"}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {events.length === 0 && (
              <Text className="text-on-dark-soft text-sm mt-1">
                You're not on any event roster right now. Once an organizer adds
                you, the event shows up here.
              </Text>
            )}
          </>
        )}

        {error ? <Text className="text-red-400 text-sm mt-4">{error}</Text> : null}

        <Text className="text-on-dark-soft text-xs mt-6 leading-5">
          Your position is shared only while tracking is running on the Track
          tab, and only with the event you pick here.
        </Text>
      </View>
    </ScrollView>
  );
}
