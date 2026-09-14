import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { theme } from "../lib/theme";
import {
  previewRosterClaim, claimRosterRow, rosterClaimMessage,
  type RosterPreview,
} from "../lib/deviceIdentity";

/**
 * "Have an event code?" — the rider links themselves to a roster row the
 * organizer imported.
 *
 * The design constraint that shaped this: a rider must never be shown a list of
 * entrants to pick from. A list is a roster leak, and a mis-tap on one puts the
 * wrong person on the map under someone else's number — which is a phone call
 * to the organizer at the worst possible moment. So the rider supplies two
 * things they already hold, the event code and their own number, the server
 * matches both, and the only thing that comes back is one masked name to
 * confirm. Nothing to browse, nothing to mis-tap.
 *
 * And it is reversible: "Not you?" on the linked event releases the row.
 */
export default function RosterClaim({ onLinked }: { onLinked: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [riderNumber, setRiderNumber] = useState("");
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function reset() {
    setJoinCode(""); setRiderNumber(""); setPreview(null); setMessage("");
  }

  async function findEntry() {
    if (!joinCode.trim() || !riderNumber.trim()) {
      setMessage("Enter both the event code and your rider number.");
      return;
    }
    setBusy(true); setMessage(""); setPreview(null);
    try {
      const r = await previewRosterClaim(joinCode.trim(), riderNumber.trim());
      if (r.ok) setPreview(r);
      else setMessage(rosterClaimMessage(r.error, r.event_name));
    } catch (e: any) {
      setMessage(e?.message ?? "Couldn't reach Waypoint. Check your signal.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true); setMessage("");
    try {
      const r = await claimRosterRow(joinCode.trim(), riderNumber.trim());
      if (!r.ok) {
        setMessage(rosterClaimMessage(r.error, r.event_name));
        setPreview(null);
        return;
      }
      await onLinked();
      setOpen(false);
      reset();
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
          Add yourself to an event the organizer already entered you in
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="rounded-xl p-4 mb-2 bg-surface-dark-elevated">
      <Text className="text-on-dark font-semibold mb-1">Find your entry</Text>
      <Text className="text-on-dark-soft text-xs mb-4 leading-5">
        The event code the organizer sent you, and the rider number on your bike.
      </Text>

      <Text className="text-on-dark-soft text-xs uppercase font-bold mb-2">Event code</Text>
      <TextInput
        className="bg-surface-dark text-white border border-white/10 rounded-lg px-4 py-3.5 text-base mb-4"
        placeholder="ABC123"
        placeholderTextColor={theme.muted}
        value={joinCode}
        onChangeText={(t) => { setJoinCode(t); setPreview(null); }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={16}
        editable={!busy}
      />

      <Text className="text-on-dark-soft text-xs uppercase font-bold mb-2">Your rider number</Text>
      <TextInput
        className="bg-surface-dark text-white border border-white/10 rounded-lg px-4 py-3.5 text-base"
        placeholder="42"
        placeholderTextColor={theme.muted}
        value={riderNumber}
        onChangeText={(t) => { setRiderNumber(t); setPreview(null); }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        editable={!busy}
      />

      {/* One name, masked. Never a list. */}
      {preview?.ok && (
        <View className="mt-4 rounded-lg bg-surface-dark p-4">
          <Text className="text-on-dark-soft text-xs uppercase font-bold mb-1">Is this you?</Text>
          <Text className="text-white text-xl font-bold">{preview.masked_name}</Text>
          <Text className="text-on-dark-soft text-sm mt-1">
            {preview.rider_number ? `#${preview.rider_number}` : "No number"}
            {preview.rider_class ? ` · ${preview.rider_class}` : ""}
          </Text>
          <Text className="text-on-dark-soft text-sm mt-0.5" numberOfLines={2}>
            {preview.event_name}
          </Text>
        </View>
      )}

      {message ? <Text className="text-red-400 text-sm mt-4 leading-5">{message}</Text> : null}

      <View className="flex-row gap-2 mt-4">
        <TouchableOpacity
          className="rounded-lg px-4 py-3 bg-surface-dark flex-1 items-center"
          onPress={() => { setOpen(false); reset(); }}
          disabled={busy}
        >
          <Text className="text-on-dark-soft font-bold text-sm">Cancel</Text>
        </TouchableOpacity>

        {preview?.ok ? (
          <TouchableOpacity
            className="rounded-lg px-4 py-3 bg-primary flex-1 items-center"
            onPress={confirm}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={theme.actionInk} />
              : <Text className="text-on-primary font-bold text-sm">Yes, that's me</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="rounded-lg px-4 py-3 bg-primary flex-1 items-center"
            onPress={findEntry}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={theme.actionInk} />
              : <Text className="text-on-primary font-bold text-sm">Find my entry</Text>}
          </TouchableOpacity>
        )}
      </View>

      {preview?.ok && (
        <Text className="text-on-dark-soft text-xs mt-3 leading-5">
          Not your name? Check the rider number — you can undo this later either way.
        </Text>
      )}
    </View>
  );
}
