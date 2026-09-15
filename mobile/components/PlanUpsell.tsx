import { View, Text, TouchableOpacity, Linking } from "react-native";
import { PRICING_URL } from "../lib/entitlements";

/**
 * The paywall, said out loud.
 *
 * Before this, hitting a paid feature on the phone meant either silently
 * getting it anyway (history) or a raw Postgres RLS error (privacy zones).
 * Neither tells a rider what to do next. This says what the feature is, which
 * plan carries it, and opens the pricing page — checkout stays on the web,
 * where the Stripe flow already lives.
 */
export default function PlanUpsell({
  title, body, plan = "Individual", compact = false,
}: {
  title: string;
  body: string;
  plan?: string;
  compact?: boolean;
}) {
  return (
    <View
      className={`bg-surface-dark-elevated border border-hairline rounded-xl ${compact ? "p-4" : "p-5"}`}
    >
      <Text className="text-accent text-xs uppercase font-bold tracking-wider mb-2">
        {plan}
      </Text>
      <Text className={`text-white font-bold ${compact ? "text-base" : "text-lg"} mb-1.5`}>
        {title}
      </Text>
      <Text className="text-on-dark-soft text-sm leading-5 mb-4">{body}</Text>
      <TouchableOpacity
        className="bg-primary rounded-lg py-3 items-center"
        onPress={() => Linking.openURL(PRICING_URL)}
      >
        <Text className="text-on-primary font-bold text-sm">See plans</Text>
      </TouchableOpacity>
      <Text className="text-on-dark-soft text-xs text-center mt-2.5 leading-4">
        Manage your plan at waypointtracking.com
      </Text>
    </View>
  );
}
