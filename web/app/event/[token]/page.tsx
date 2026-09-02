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

  // Pull the event name for the header/title; the map loads its own data.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/live/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.event?.name) {
          setName(d.event.name);
          document.title = `${d.event.name} — Live Tracking — Waypoint`;
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
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
          Waypoint
        </span>
        <span style={{ color: "#7E93A0", fontSize: 13 }}>
          {name ? `Live tracking · ${name}` : "Live tracking"}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveEventMap shareToken={token} />
      </div>
    </div>
  );
}
