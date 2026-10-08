import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { theme } from "../../lib/theme";
import { useRadio } from "../../lib/RadioContext";
import { ago } from "../../lib/radio";
import TalkButton from "../../components/TalkButton";

/**
 * Event radio. Riders are on it automatically once they've joined an event that
 * has radio turned on; marshals and race control join with the organizer's code.
 * Live audio only — nothing is recorded on the phone or queued for later.
 */

const UNAVAILABLE: Record<string, string> = {
  invalid_token: "Join an event on the Track tab first. If the event has radio turned on, you'll be on it automatically.",
  comms_disabled: "Radio isn't turned on for your event.",
  event_closed: "Your event has ended.",
  offline: "No connection right now. Radio needs signal.",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: theme.surface, borderColor: theme.hairline, borderWidth: 1, borderRadius: 12, padding: 16 }}>
      {children}
    </View>
  );
}

function StaffCodeForm() {
  const r = useRadio();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = code.replace(/[^A-Za-z0-9]/g, "").length === 6 && name.trim().length >= 2;

  return (
    <Card>
      <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 15, marginBottom: 4 }}>Staff or race control?</Text>
      <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
        Enter the radio code from the organizer and your name. It shows to everyone when you talk.
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="CODE"
        placeholderTextColor={theme.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        style={{ backgroundColor: theme.canvas, color: theme.ink, borderColor: theme.hairline, borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 20, fontWeight: "800", letterSpacing: 4, marginBottom: 10 }}
      />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={theme.faint}
        autoComplete="name"
        maxLength={40}
        style={{ backgroundColor: theme.canvas, color: theme.ink, borderColor: theme.hairline, borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 12 }}
      />
      <Pressable
        disabled={!ready || busy}
        onPress={async () => {
          setBusy(true);
          setErr(await r.redeem(code, name));
          setBusy(false);
        }}
        style={{ backgroundColor: theme.action, opacity: ready && !busy ? 1 : 0.5, borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: theme.actionInk, fontWeight: "800" }}>{busy ? "Joining…" : "Join radio"}</Text>
      </Pressable>
      {err && <Text style={{ color: theme.danger, marginTop: 10, fontSize: 13 }}>{err}</Text>}
    </Card>
  );
}

export default function RadioScreen() {
  const r = useRadio();

  if (r.status === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.canvas }}>
        <ActivityIndicator color={theme.action} />
      </View>
    );
  }

  const live = r.status === "live" || r.status === "reconnecting";
  const dot = r.status === "live" ? theme.action : r.status === "reconnecting" ? theme.warn : theme.faint;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.canvas }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      {/* Who and where */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
        <Text style={{ color: theme.ink, fontWeight: "800", fontSize: 16, flex: 1 }} numberOfLines={1}>
          {r.join?.event_name ?? "Event radio"}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          {r.status === "live" ? "LIVE" : r.status === "reconnecting" ? "RECONNECTING" : r.status === "connecting" ? "CONNECTING" : "OFF"}
        </Text>
      </View>
      {r.join && (
        <Text style={{ color: theme.muted, fontSize: 13, marginTop: -8 }}>
          You: <Text style={{ color: theme.body, fontWeight: "700" }}>{r.join.label}</Text>
          {" · "}{r.join.role === "control" ? "Race control" : r.join.role === "rider" ? "Rider" : "Staff"}
        </Text>
      )}

      {r.status === "unavailable" && (
        <>
          <Card>
            <Text style={{ color: theme.body, fontSize: 14, lineHeight: 20 }}>
              {UNAVAILABLE[r.reason ?? ""] ?? "Radio isn't available right now."}
            </Text>
            {r.reason === "invalid_token" && !r.staff && (
              <Pressable onPress={() => router.push("/(tabs)/track")} style={{ marginTop: 12 }}>
                <Text style={{ color: theme.action, fontWeight: "700" }}>Go to Track →</Text>
              </Pressable>
            )}
            <Pressable onPress={() => r.recheck()} style={{ marginTop: 12 }}>
              <Text style={{ color: theme.muted, fontWeight: "600" }}>Check again</Text>
            </Pressable>
          </Card>
          {!r.staff && <StaffCodeForm />}
        </>
      )}

      {(r.status === "idle" || r.status === "connecting") && (
        <Card>
          <Text style={{ color: theme.body, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
            Live push-to-talk with race control and your group. The microphone is only on while you hold the button.
          </Text>
          <Pressable
            onPress={() => r.connect()}
            disabled={r.status === "connecting"}
            style={{ backgroundColor: theme.action, borderRadius: 10, padding: 16, alignItems: "center", opacity: r.status === "connecting" ? 0.6 : 1 }}
          >
            <Text style={{ color: theme.actionInk, fontWeight: "900", fontSize: 16 }}>
              {r.status === "connecting" ? "Connecting…" : "Turn on radio"}
            </Text>
          </Pressable>
          {r.error && <Text style={{ color: theme.danger, marginTop: 10, fontSize: 13 }}>{r.error}</Text>}
        </Card>
      )}

      {live && r.join && (
        <>
          {r.instruction && (
            <View style={{ backgroundColor: theme.surfaceHi, borderLeftWidth: 4, borderLeftColor: theme.accent, borderRadius: 8, padding: 12 }}>
              <Text style={{ color: theme.body, fontSize: 13 }}>
                Last all-call · <Text style={{ color: theme.ink, fontWeight: "800" }}>{r.instruction.speaker}</Text> · {ago(r.instruction.age_s)}
              </Text>
            </View>
          )}

          <TalkButton size="big" />
          {r.notice && <Text style={{ color: theme.warn, fontSize: 14, textAlign: "center" }}>{r.notice}</Text>}
          {r.error && <Text style={{ color: theme.danger, fontSize: 13 }}>{r.error}</Text>}

          {r.join.role === "control" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Switch value={r.allCall} onValueChange={r.setAllCall} trackColor={{ true: theme.warn, false: theme.hairline }} />
              <Text style={{ color: r.allCall ? theme.warn : theme.muted, fontSize: 14, flex: 1 }}>
                All-call — cuts in on every channel
              </Text>
            </View>
          )}

          <Card>
            <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 }}>CHANNELS</Text>
            {r.join.channels.map((c) => {
              const on = !r.listenOff.has(c.id);
              const selected = !r.allCall && r.talkChannel === c.id;
              const speaker = r.speakers[c.id];
              return (
                <View
                  key={c.id}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12,
                    borderTopWidth: 1, borderTopColor: theme.hairlineSoft,
                  }}
                >
                  <Pressable
                    disabled={!c.can_talk || r.allCall || r.talking}
                    onPress={() => r.setTalkChannel(c.id)}
                    style={{ flex: 1 }}
                  >
                    <Text style={{ color: on ? theme.ink : theme.faint, fontSize: 16, fontWeight: selected ? "900" : "600" }}>
                      {selected ? "● " : ""}{c.name}
                    </Text>
                    <Text style={{ color: speaker ? theme.action : theme.faint, fontSize: 12, marginTop: 2 }}>
                      {speaker ? `talking: ${speaker}` : c.can_talk ? (selected ? "you talk here" : "tap to talk here") : "listen only"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => r.toggleListen(c.id)}
                    style={{ borderWidth: 1, borderColor: theme.hairline, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: on ? theme.body : theme.faint, fontWeight: "700", fontSize: 12 }}>{on ? "ON" : "OFF"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>

          <Pressable onPress={() => r.disconnect()}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>Turn off radio</Text>
          </Pressable>
        </>
      )}

      {r.staff && (
        <Pressable onPress={() => r.signOutStaff()}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            Signed in as staff ({r.staff.label} · {r.staff.event_name}). Sign out of staff radio
          </Text>
        </Pressable>
      )}

      {(r.status === "idle" || live) && !r.staff && r.join?.role === "rider" && (
        <Text style={{ color: theme.faint, fontSize: 12, lineHeight: 17 }}>
          Staff or race control on this phone? Turn off the radio and use your code below.
        </Text>
      )}
    </ScrollView>
  );
}
