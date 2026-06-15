import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("trips")
    .select("name, started_at")
    .eq("share_token", token)
    .single();

  const tripName = data?.name ?? "Trip Story";
  const date = data?.started_at
    ? new Date(data.started_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return {
    title: `${tripName} — Trip Story`,
    description: `${tripName}${date ? ` · ${date}` : ""} — animated route replay, stats, and live tracking on Waypoint.`,
    openGraph: {
      title: `${tripName} — Trip Story`,
      description: `Animated route replay and stats for ${tripName}.`,
      type: "website",
    },
  };
}

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
