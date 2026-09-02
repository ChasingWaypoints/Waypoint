import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.chasingwaypoints.com"),
  title: {
    default: "Waypoint — Live Event Tracking for Rally & Off-Road",
    template: "%s — Waypoint",
  },
  description:
    "Every entrant's beacon on one live map. Garmin inReach, SPOT and ZOLEO, no app required. Google Earth Pro feeds for recovery teams and an embeddable map for your event site.",
  openGraph: {
    siteName: "Waypoint",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
