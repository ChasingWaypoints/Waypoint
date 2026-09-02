import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Tracking — Waypoint",
  // Embedded maps shouldn't be indexed on their own
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
