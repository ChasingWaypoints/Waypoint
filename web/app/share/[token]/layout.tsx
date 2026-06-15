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
    .select("name")
    .eq("share_token", token)
    .single();

  const tripName = data?.name ?? "Shared Trip";

  return {
    title: tripName,
    description: `Follow ${tripName} live on Waypoint — real-time GPS tracking for adventure sports.`,
    openGraph: {
      title: `${tripName} — Waypoint`,
      description: `Follow ${tripName} live — real-time GPS tracking.`,
      type: "website",
    },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
