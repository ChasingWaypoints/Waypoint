"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { authFetch } from "../../../../../lib/authFetch";
import LiveEventMap from "../../../../../components/LiveEventMap";
import EventShareLinks from "../../../../../components/EventShareLinks";
import { theme, font } from "../../../../../lib/theme";

/**
 * The organizer's event control page: live map, roster with feed health,
 * and the links they hand out.
 *
 * This is the page Victor described as "generate a page for tracking
 * purposes for an event" — everything for one event in one place.
 */

type Tab = "map" | "share";

export default function EventTrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("map");
  const [event, setEvent] = useState<{ name: string; share_token: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    authFetch(`/api/events/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load this event");
        const d = await r.json();
        setEvent(d.event ?? d);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return <div style={{ padding: 40, font: `14px ${font.sans}`, color: theme.danger, background: theme.canvas, minHeight: "100vh" }}>{error}</div>;
  }
  if (!event) {
    return <div style={{ padding: 40, font: `14px ${font.sans}`, color: theme.muted, background: theme.canvas, minHeight: "100vh" }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.canvas }}>
      <header
        style={{
          padding: "14px 24px",
          borderBottom: `1px solid ${theme.hairline}`,
          background: theme.surface,
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexShrink: 0,
        }}
      >
        <Link
          href={`/dashboard/events/${id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: theme.body,
            textDecoration: "none",
            border: `1px solid ${theme.hairline}`,
            borderRadius: 4,
            padding: "8px 14px",
            font: `600 13px ${font.sans}`,
            whiteSpace: "nowrap",
          }}
          title="Back to event setup"
        >
          ← Event dashboard
        </Link>

        <div>
          <h1 style={{ font: `700 20px ${font.sans}`, color: theme.ink, margin: 0 }}>
            {event.name}
          </h1>
          <div style={{ font: `13px ${font.sans}`, color: event.status === "active" ? theme.live : theme.muted, marginTop: 2 }}>
            {event.status === "active" ? "Live" : event.status}
          </div>
        </div>

        <nav style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["map", "share"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? theme.accent : "transparent",
                color: tab === t ? theme.accentInk : theme.body,
                border: tab === t ? "none" : `1px solid ${theme.hairline}`,
                borderRadius: 4,
                padding: "8px 16px",
                font: `${tab === t ? 700 : 500} 13px ${font.sans}`,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t === "map" ? "Live map" : t}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, overflow: tab === "map" ? "hidden" : "auto" }}>
        {tab === "map" && <LiveEventMap shareToken={event.share_token} organizerEventId={id} />}
        {tab === "share" && (
          <div style={{ padding: 24, maxWidth: 800 }}>
            <EventShareLinks eventId={id} shareToken={event.share_token} origin={origin} />
          </div>
        )}
      </main>
    </div>
  );
}
