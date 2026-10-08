import { Pressable, Text, View } from "react-native";
import { theme } from "../lib/theme";
import { useRadio } from "../lib/RadioContext";

/**
 * Hold-to-talk. `size="big"` fills the Radio tab; `size="mini"` sits on the
 * Track screen so a rider on a bar mount never has to switch tabs.
 * Pressable fires onPressIn/onPressOut directly — no long-press text selection
 * to fight like the iPhone browser.
 */
export default function TalkButton({ size = "big" }: { size?: "big" | "mini" }) {
  const r = useRadio();
  if (r.status !== "live" || !r.join) return null;
  const talkable = r.join.channels.filter((c) => c.can_talk);
  if (!talkable.length) return null;

  const target = r.allCall
    ? r.join.channels.find((c) => c.kind === "race_control")
    : r.join.channels.find((c) => c.id === r.talkChannel);
  const big = size === "big";
  const bg = r.talking ? theme.danger : r.allCall ? theme.warn : theme.action;
  const ink = r.talking ? "#FFFFFF" : theme.actionInk;

  return (
    <Pressable
      onPressIn={() => r.startTalk()}
      onPressOut={() => r.stopTalk()}
      accessibilityRole="button"
      accessibilityLabel={r.talking ? "On air, release to stop" : `Hold to talk on ${target?.name ?? "radio"}`}
      style={{
        backgroundColor: bg,
        borderRadius: big ? 20 : 12,
        paddingVertical: big ? 52 : 14,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: ink, fontWeight: "900", fontSize: big ? 24 : 15, letterSpacing: 1 }}>
        {r.talking ? "ON AIR" : "HOLD TO TALK"}
      </Text>
      <View style={{ height: big ? 6 : 2 }} />
      <Text style={{ color: ink, fontWeight: "600", fontSize: big ? 14 : 11, opacity: 0.8 }}>
        {r.talking ? "release to stop" : target?.name ?? "—"}
      </Text>
    </Pressable>
  );
}
