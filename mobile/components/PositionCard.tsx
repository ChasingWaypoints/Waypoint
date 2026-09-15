import { useState } from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  COORD_FORMAT_LABELS, formatCoord, googleMapsUrl, type CoordFormat,
} from "../lib/coords";

/**
 * What you get when you tap yourself on the map.
 *
 * Four coordinate formats, each with its own copy button, because the format
 * you need is whichever one the person on the other end of the radio asks for.
 * Decimal leads since that's what Waypoint uses everywhere else.
 */

const ORDER: CoordFormat[] = ["decimal", "dms", "ddm", "utm"];

export type PositionInfo = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKmh?: number | null;
  headingDeg?: number | null;
  batteryPct?: number | null;
  /** ms since this fix was taken */
  ageMs?: number | null;
  title?: string;
};

function age(ms?: number | null): string {
  if (ms == null) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function PositionCard({
  info, onClose,
}: { info: PositionInfo; onClose: () => void }) {
  const [copied, setCopied] = useState<CoordFormat | null>(null);

  async function copy(fmt: CoordFormat) {
    await Clipboard.setStringAsync(formatCoord(fmt, info.lat, info.lng));
    setCopied(fmt);
    setTimeout(() => setCopied((c) => (c === fmt ? null : c)), 1800);
  }

  const facts = [
    info.accuracyM != null ? `±${Math.round(info.accuracyM)} m` : null,
    info.speedKmh != null ? `${Math.round(info.speedKmh)} km/h` : null,
    info.headingDeg != null ? `${Math.round(info.headingDeg)}°` : null,
    info.batteryPct != null ? `${info.batteryPct}% battery` : null,
  ].filter(Boolean) as string[];

  return (
    <View className="bg-surface-dark-elevated border border-hairline rounded-xl p-4">
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-1 pr-3">
          <Text className="text-white text-base font-bold" numberOfLines={1}>
            {info.title ?? "Your position"}
          </Text>
          <Text className="text-on-dark-soft text-xs mt-1 leading-4">
            {age(info.ageMs)}
            {facts.length ? ` · ${facts.join(" · ")}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} className="px-3 py-1 -mt-1">
          <Text className="text-on-dark-soft text-xl font-bold">×</Text>
        </TouchableOpacity>
      </View>

      {/* Each format is its own padded tile. They used to be bare rows split by
          hairlines, which left the coordinates jammed against the divider with
          no inset — hard to read at arm's length on a bike. */}
      {ORDER.map((fmt) => (
        <TouchableOpacity
          key={fmt}
          onPress={() => copy(fmt)}
          activeOpacity={0.7}
          className="bg-surface-dark rounded-lg px-4 py-3 mb-2"
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-on-dark-soft text-xs uppercase font-bold tracking-wider">
              {COORD_FORMAT_LABELS[fmt]}
            </Text>
            <View className={`rounded-md px-3 py-1.5 ${copied === fmt ? "bg-primary" : "bg-surface-dark-elevated"}`}>
              <Text className={`text-xs font-bold ${copied === fmt ? "text-on-primary" : "text-on-dark"}`}>
                {copied === fmt ? "Copied" : "Copy"}
              </Text>
            </View>
          </View>
          {/* Wraps rather than truncates: a UTM or DMS string read to a crew
              over the radio is useless with the end cut off. */}
          <Text className="text-white text-base leading-6" selectable>
            {formatCoord(fmt, info.lat, info.lng)}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        className="bg-primary rounded-lg py-3.5 items-center mt-2"
        onPress={() => Linking.openURL(googleMapsUrl(info.lat, info.lng))}
      >
        <Text className="text-on-primary font-bold text-sm">Open in Google Maps</Text>
      </TouchableOpacity>
    </View>
  );
}
