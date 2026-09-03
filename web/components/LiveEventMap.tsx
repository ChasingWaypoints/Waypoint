"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import TrackingMap, { Entrant, StageLine } from "./TrackingMap";
import { LngLat, timeAgo } from "../lib/geo";
import { theme, font } from "../lib/theme";

interface EventMeta {
  name: string;
  status: string;
  route_gpx: string | null;
  route_name: string | null;
  starts_at: string | null;
}

interface Props {
  shareToken: string;
  /** Embed mode: no roster sidebar, minimal chrome. */
  compact?: boolean;
  refreshMs?: number;
  /** Organizer view of this event — enables the emergency-info popup. */
  organizerEventId?: string;
}

export default function LiveEventMap({
  shareToken,
  compact = false,
  refreshMs = 30_000,
  organizerEventId,
}: Props) {
  const [event, setEvent] = useState<EventMeta | null>(null);
  const [stages, setStages] = useState<StageLine[]>([]);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<LngLat[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());

  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const load = useCallback(async () => {
    try {
      const q = selectedRef.current ? `?track=${selectedRef.current}` : "";
      const res = await fetch(`/api/events/live/${shareToken}${q}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Event not found" : "Could not load positions");
        return;
      }
      const data = await res.json();
      setEvent(data.event);
      setStages(data.stages ?? []);
      setEntrants(data.entrants ?? []);
      if (data.track) {
        setTrack(data.track.map((p: LngLat) => ({ lat: p.lat, lng: p.lng })));
      } else {
        setTrack(undefined);
      }
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, refreshMs);
    // Pause polling when the tab is hidden — a spectator leaving this
    // open all day shouldn't keep hitting the function.
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, refreshMs]);

  const selectEntrant = useCallback(
    (id: string) => {
      setSelected((prev) => (prev === id ? null : id));
      setTimeout(load, 0);
    },
    [load]
  );

  if (loading) {
    return <div style={centered}>Loading event…</div>;
  }
  if (error) {
    return <div style={{ ...centered, color: theme.danger }}>{error}</div>;
  }

  const withFix = entrants.filter((e) => e.lat !== null);

  // ── Class grouping / filtering ──
  const classKey = (e: Entrant) => (e.class && e.class.trim() ? e.class.trim() : "Unclassified");
  const classes = Array.from(new Set(entrants.map(classKey))).sort((a, b) =>
    a === "Unclassified" ? 1 : b === "Unclassified" ? -1 : a.localeCompare(b)
  );
  const visible = classFilter.size === 0 ? entrants : entrants.filter((e) => classFilter.has(classKey(e)));
  const toggleClass = (c: string) =>
    setClassFilter((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c); else n.add(c);
      return n;
    });

  const renderEntrant = (e: Entrant) => {
    const mins = e.last_seen_at ? (Date.now() - new Date(e.last_seen_at).getTime()) / 60000 : null;
    const color = mins === null ? theme.noFix : mins <= 15 ? theme.live : mins <= 60 ? theme.stale : theme.dark;
    return (
      <button
        key={e.id}
        onClick={() => selectEntrant(e.id)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
          padding: "10px 16px", border: "none", borderBottom: `1px solid ${theme.hairlineSoft}`,
          background: selected === e.id ? theme.surfaceHi : "transparent", cursor: "pointer",
          font: `13px ${font.sans}`, color: theme.body,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: theme.ink }}>
            {e.number ? `#${e.number} ` : ""}
            {e.name}
          </span>
          <br />
          <span style={{ color: theme.muted, fontSize: 12 }}>
            {e.class ? `${e.class} · ` : ""}
            {timeAgo(e.last_seen_at)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: theme.canvas }}>
      {!compact && (
        <aside
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: `1px solid ${theme.hairline}`,
            background: theme.surface,
            display: "flex",
            flexDirection: "column",
            font: `13px ${font.sans}`,
            color: theme.body,
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.hairline}` }}>
            <div style={{ font: `700 16px ${font.sans}`, color: theme.ink }}>
              {event?.name}
            </div>
            <div style={{ color: theme.muted, marginTop: 4 }}>
              {withFix.length} of {entrants.length} reporting
              {lastRefresh && <> &middot; updated {lastRefresh.toLocaleTimeString()}</>}
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {entrants.length === 0 && (
              <div style={{ padding: 16, color: theme.muted }}>
                No entrants have reported a position yet.
              </div>
            )}

            {classes.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 12px", borderBottom: `1px solid ${theme.hairline}` }}>
                {[{ c: "", label: "All" }, ...classes.map((c) => ({ c, label: c }))].map(({ c, label }) => {
                  const active = c === "" ? classFilter.size === 0 : classFilter.has(c);
                  return (
                    <button
                      key={label}
                      onClick={() => (c === "" ? setClassFilter(new Set()) : toggleClass(c))}
                      style={{
                        font: `600 11px ${font.sans}`,
                        padding: "4px 10px",
                        borderRadius: 12,
                        cursor: "pointer",
                        border: `1px solid ${active ? theme.accent : theme.hairline}`,
                        background: active ? theme.accent : "transparent",
                        color: active ? theme.accentInk : theme.body,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {classes.map((c) => {
              const items = visible.filter((e) => classKey(e) === c);
              if (items.length === 0) return null;
              return (
                <div key={c}>
                  {classes.length > 1 && (
                    <div style={{ padding: "8px 16px", background: theme.canvas, color: theme.muted, font: `700 11px ${font.sans}`, letterSpacing: 1, textTransform: "uppercase" }}>
                      {c} <span style={{ color: theme.faint }}>({items.length})</span>
                    </div>
                  )}
                  {items.map(renderEntrant)}
                </div>
              );
            })}
          </div>

          {selected && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: `1px solid ${theme.hairline}`,
                color: theme.muted,
                fontSize: 12,
              }}
            >
              Showing trail for the selected entrant. Click again to clear.
            </div>
          )}
        </aside>
      )}

      <div style={{ flex: 1, position: "relative" }}>
        <TrackingMap
          entrants={visible}
          routeGpx={event?.route_gpx}
          stages={stages}
          routeName={event?.route_name}
          compact={compact}
          onSelectEntrant={selectEntrant}
          selectedTrack={track}
          organizerEventId={organizerEventId}
        />
      </div>
    </div>
  );
}

const centered: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  background: theme.canvas,
  font: `14px ${font.sans}`,
  color: theme.muted,
};
