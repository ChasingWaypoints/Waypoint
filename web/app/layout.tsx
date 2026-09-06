import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted via next/font/local (woff2 vendored in app/fonts). No runtime
// Google Fonts dependency; zero layout shift; exposed as CSS variables that
// globals.css and lib/theme.ts consume.
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

const barlowCondensed = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/BarlowCondensed-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Barlow Condensed", "system-ui", "sans-serif"],
});

export const viewport: Viewport = {
  // Extend the layout under the notch / home indicator so env(safe-area-inset-*)
  // is honored; pages that use it (e.g. the public event page) then pad
  // themselves so nothing hides behind the browser chrome or hardware cutouts.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chasingwaypoints.com"),
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
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${jetbrainsMono.variable} ${barlowCondensed.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
