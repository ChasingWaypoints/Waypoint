"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LiveEventMap from "../../../components/LiveEventMap";

/**
 * Public spectator page for a group event.
 *
 * Thin wrapper around LiveEventMap so it shares the exact same map as the
 * organizer's tracking page and the embed — Esri satellite by default with
 * the full layer switcher, live entrant markers, status colours and trails.
 * Addressed by the event's public share token.
 */
export default function EventPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<{ name?: string; logo_url: string }[]>([]);

  // Pull the event name for the header/title; the map loads its own data.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/live/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.event) {
          if (d.event.name) {
            setName(d.event.name);
            document.title = `${d.event.name} — Live Tracking — Waypoint`;
          }
          setLogoUrl(d.event.logo_url ?? null);
          setSponsors(Array.isArray(d.event.sponsors) ? d.event.sponsors : []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0A0A0A" }}>
      <div
        style={{
          background: "#0C1E29",
          borderBottom: "1px solid #1E3B4C",
          height: 60,
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        {/* Event logo slot — renders when the event has a logo (branding feature). */}
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            style={{ height: 40, width: "auto", maxWidth: 160, objectFit: "contain", flexShrink: 0 }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name || "Live Event"}
          </span>
          <span style={{ color: "#7E93A0", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#CCFF00", display: "inline-block" }} />
            Live · Waypoint
          </span>
        </div>

        {/* Sponsor strip — right side of the header (branding feature). */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          {sponsors.map((sp, i) =>
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={sp.logo_url}
              alt={sp.name ?? ""}
              title={sp.name ?? ""}
              style={{ height: 30, width: "auto", maxWidth: 120, objectFit: "contain" }}
            />
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveEventMap shareToken={token} />
      </div>
    </div>
  );
}
