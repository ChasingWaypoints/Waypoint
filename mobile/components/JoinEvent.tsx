import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { theme } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { joinEventByCode, joinMessage } from "../lib/deviceIdentity";

/**
 * "Have an event code?" — the rider's way onto an organizer's map.
 *
 * This replaces a claim-only box that could not actually get a rider into a
 * free group ride. The phone had no join-by-code path at all: the screen that
 * did it was deleted in the three-tab simplification, so a rider invited to a
 * ride entered the code, matched no roster row because nobody had imported
 * one, and hit a dead end.
 *
 * The code is the only required field. The rider number is optional and exists
 * for the case where an organizer already put them on a roster — the server
 * uses it to claim that exact row rather than create a duplicate. A rider who
 * was never on a roster leaves it blank and simply joins.
 */
export default function JoinEvent({ onJoined }: { onJoined: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [riderNumber, setRiderNumber] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * The name the organizer will see on their roster. We prefill it from the
   * account rather than asking — but if the account has no name we must ask,
   * because the alternative is joining someone's ride as "Rider".
   */
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [message, setMessage] = useState("");
  const [payUrl, setPayUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const known =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        "";
      setName(known.trim());
      setNeedsName(!known.trim());
    });
  }, []);

  function reset() {
    setCode(""); setRiderNumber(""); setMessage(""); setPayUrl(null);
  }

  async function submit() {
    if (!code.trim()) { setMessage("Enter the event code."); return; }
    if (!name.trim()) { setMessage("Enter the name the organizer should see."); return; }
    setBusy(true); setMessage(""); setPayUrl(null);
    try {
      const r = await joinEventByCode(code, riderNumber, name);
      if (r.ok) {
        await onJoined();
        setOpen(false);
        reset();
        return;
      }
      setMessage(joinMessage(r));
      // Entrant-pays events finish on the web, where a card can be taken.
      if (r.error === "needs_payment") setPayUrl("https://waypointtracking.com/dashboard");
    } catch (e: any) {
      setMessage(e?.message ?? "Couldn't reach Waypoint. Check your signal.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <TouchableOpacity
        className="rounded-xl p-4 mb-2 bg-surface-dark border border-white/10"
        onPress={() => setOpen(true)}
      >
        <Text className="text-on-dark font-semibold">Have an event code?</Text>
        <Text className="text-on-dark-soft text-xs mt-0.5">
          Join a ride or event and appear on the organizer's map
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="rounded-xl p-4 mb-2 bg-surface-dark-elevated">
      <Text className="text-on-dark font-semibold mb-1">Join an event</Text>
      <Text className="text-on-dark-soft text-xs mb-4 leading-5">
        The code the organizer sent you.
      </Text>

      <Text className="text-on-dark-soft text-xs uppercase font-bold mb-2">
        Your name {needsName ? "" : <Text className="text-muted-soft">— as the organizer will see it</Text>}
      </Text>
      <TextInput
        className="bg-surface-dark text-white border border-white/10 rounded-lg px-4 py-3.5 text-base mb-4"
        placeholder="Jane Doe"
        placeholderTextColor={theme.muted}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={60}
        editable={!busy}
      />

      <Text className="text-on-dark-soft text-xs uppercase font-bold mb-2">Event code</Text>
      <TextInput
        className="bg-surface-dark text-white border border-white/10 rounded-lg px-4 py-3.5 text-base mb-4"
        placeholder="ABC123"
        placeholderTextColor={theme.muted}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={16}
        editable={!busy}
      />

      <Text className="text-on-dark-soft text-xs uppercase font-bold mb-2">
        Rider number <Text className="text-muted-soft">— optional</Text>
      </Text>
      <TextInput
        className="bg-surface-dark text-white border border-white/10 rounded-lg px-4 py-3.5 text-base"
        placeholder="Only if the organizer gave you one"
        placeholderTextColor={theme.muted}
        value={riderNumber}
        onChangeText={setRiderNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        editable={!busy}
      />
      <Text className="text-on-dark-soft text-xs mt-2 leading-4">
        If you're already on the roster, this links you to your entry.
      </Text>

      {message ? <Text className="text-red-400 text-sm mt-4 leading-5">{message}</Text> : null}

      {payUrl && (
        <TouchableOpacity
          className="bg-surface-dark rounded-lg py-3 items-center mt-3"
          onPress={() => Linking.openURL(payUrl)}
        >
          <Text className="text-on-dark font-bold text-sm">Open waypointtracking.com</Text>
        </TouchableOpacity>
      )}

      <View className="flex-row gap-2 mt-4">
        <TouchableOpacity
          className="rounded-lg px-4 py-3 bg-surface-dark flex-1 items-center"
          onPress={() => { setOpen(false); reset(); }}
          disabled={busy}
        >
          <Text className="text-on-dark-soft font-bold text-sm">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="rounded-lg px-4 py-3 bg-primary flex-1 items-center"
          onPress={submit}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color={theme.actionInk} />
            : <Text className="text-on-primary font-bold text-sm">Join</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
