import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The embeddable event map is meant to be iframed by organizers
        // on their own sites, so framing is explicitly allowed here.
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
      {
        // Everything else stays un-framable to avoid clickjacking on the
        // dashboard and auth pages. /embed is excluded here because
        // later matching rules override earlier ones for the same header.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
