"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import TrackingMap, { Entrant, StageLine } from "./TrackingMap";
import { LngLat, timeAgo } from "../lib/geo";
import { theme, font, text } from "../lib/theme";
import { authFetch } from "../lib/authFetch";
import { Skeleton } from "./Skeleton";

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
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => (typeof window !== "undefined" ? window.innerWidth >= 768 : true)
  );

  const [sosFocus, setSosFocus] = useState<string | undefined>(undefined);
  const seenSosRef = useRef<Set<string>>(new Set());
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const load = useCallback(async () => {
    try {
      const q = selectedRef.current ? `?track=${selectedRef.current}` : "";
      const res = await fetch(`/api/events/live/${shareToken}${q}`);
      // A private event returns 404 from the public feed. The organizer view then
      // falls back to the credentialed command feed below, so only bail out here
      // when there's no organizer context to fall back to.
      let data: { event?: EventMeta; stages?: StageLine[]; entrants?: Entrant[]; track?: LngLat[] } | null = null;
      if (res.ok) {
        data = await res.json();
      } else if (!organizerEventId) {
        setError(res.status === 404 ? "Event not found" : "Could not load positions");
        return;
      }
      setEvent(data?.event ?? null);
      setStages((data?.stages as typeof stages) ?? []);
      let list: Entrant[] = data?.entrants ?? [];
      // Organizer view: pull SOS + ICE from the credentialed command feed — and
      // use it as the base list when the public feed is empty (private event).
      if (organizerEventId) {
        try {
          const cRes = await authFetch(`/api/events/${organizerEventId}/command`);
          if (cRes.ok) {
            const cData = await cRes.json();
            const cEntrants = (cData.entrants ?? []) as Entrant[];
            if (list.length === 0 && cEntrants.length > 0) {
              list = cEntrants;
            } else {
              const overlay = new Map<string, { sos?: boolean; ice?: Entrant["ice"] }>();
              for (const ce of cEntrants) overlay.set(ce.id, { sos: ce.sos, ice: ce.ice });
              list = list.map((e) => ({ ...e, ...(overlay.get(e.id) ?? {}) }));
            }
            // Auto-focus a newly-raised SOS.
            const active = list.filter((e) => e.sos);
            const fresh = active.find((e) => !seenSosRef.current.has(e.id));
            if (fresh) setSosFocus(fresh.id);
            seenSosRef.current = new Set(active.map((e) => e.id));
          }
        } catch { /* keep base list if the command feed is unavailable */ }
      }
      setEntrants(list);
      if (data?.track) {
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

  async function acknowledgeSos(id: string) {
    if (!organizerEventId) return;
    await authFetch(`/api/events/${organizerEventId}/sos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: id }),
    });
    seenSosRef.current.delete(id);
    setSosFocus(undefined);
    load();
  }

  if (loading) {
    if (compact) return <div style={{ width: "100%", height: "100%", background: theme.canvas }} aria-label="Loading map" />;
    return (
      <div style={{ display: "flex", width: "100%", height: "100%", background: theme.canvas }} role="status" aria-label="Loading event">
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${theme.hairline}`, background: theme.surface, padding: "14px 16px" }}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={10} style={{ marginTop: 8 }} />
          <Skeleton width="100%" height={34} radius={8} style={{ marginTop: 16 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {[52, 40, 64].map((w, i) => <Skeleton key={i} width={w} height={22} radius={999} />)}
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Skeleton width={10} height={10} radius={999} />
                <div style={{ flex: 1 }}>
                  <Skeleton width={`${55 + ((i * 11) % 30)}%`} height={12} />
                  <Skeleton width={`${35 + ((i * 13) % 20)}%`} height={9} style={{ marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, background: theme.canvas }} />
      </div>
    );
  }
  if (error) {
    return <div style={{ ...centered, color: theme.danger }}>{error}</div>;
  }

  const withFix = entrants.filter((e) => e.lat !== null);
  const sosEntrants = entrants.filter((e) => e.sos);

  // ── Class grouping / filtering ──
  const classKey = (e: Entrant) => (e.class && e.class.trim() ? e.class.trim() : "Unclassified");
  const classes = Array.from(new Set(entrants.map(classKey))).sort((a, b) =>
    a === "Unclassified" ? 1 : b === "Unclassified" ? -1 : a.localeCompare(b)
  );
  const visible = classFilter.size === 0 ? entrants : entrants.filter((e) => classFilter.has(classKey(e)));
  // The search box narrows only the sidebar list — the map still shows every
  // class-filtered entrant, so you can find someone in the list and fly to them.
  const q = search.trim().toLowerCase();
  const listVisible = q
    ? visible.filter(
        (e) =>
          (e.name && e.name.toLowerCase().includes(q)) ||
          (e.number != null && String(e.number).toLowerCase().includes(q))
      )
    : visible;
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
        className="wp-roster-row"
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
          padding: "12px 16px", border: "none", borderBottom: `1px solid ${theme.hairlineSoft}`,
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
          <span style={{ color: theme.muted, fontSize: text.sm }}>
            {e.class ? `${e.class} · ` : ""}
            {timeAgo(e.last_seen_at)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: theme.canvas, position: "relative" }}>
      {!compact && sidebarOpen && (
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
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.hairline}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `700 16px ${font.sans}`, color: theme.ink }}>
                {event?.name}
              </div>
              <div style={{ color: theme.muted, marginTop: 4 }}>
                {withFix.length} of {entrants.length} reporting
                {lastRefresh && <> &middot; updated {lastRefresh.toLocaleTimeString()}</>}
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              title="Hide roster"
              aria-label="Hide roster"
              style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: 4, cursor: "pointer",
                border: `1px solid ${theme.hairline}`, background: "transparent",
                color: theme.body, font: `700 14px ${font.sans}`, lineHeight: 1,
              }}
            >
              &#8249;
            </button>
          </div>

          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.hairline}` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search competitors…"
              style={{
                width: "100%", boxSizing: "border-box", padding: "7px 10px",
                font: `13px ${font.sans}`, color: theme.ink, background: theme.canvas,
                border: `1px solid ${theme.hairline}`, borderRadius: 6, outline: "none",
              }}
            />
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {entrants.length === 0 && (
              <div style={{ padding: 16, color: theme.muted }}>
                No entrants have reported a position yet.
              </div>
            )}

            {entrants.length > 0 && q && listVisible.length === 0 && (
              <div style={{ padding: 16, color: theme.muted }}>
                No competitors match &ldquo;{search}&rdquo;.
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
              const items = listVisible.filter((e) => classKey(e) === c);
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
                fontSize: text.sm,
              }}
            >
              Showing trail for the selected entrant. Click again to clear.
            </div>
          )}
        </aside>
      )}

      {!compact && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Show roster"
          aria-label="Show roster"
          style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            zIndex: 3, cursor: "pointer", border: `1px solid ${theme.hairline}`,
            borderLeft: "none", borderTopRightRadius: 6, borderBottomRightRadius: 6,
            background: theme.surface, color: theme.ink, padding: "14px 6px",
            font: `700 12px ${font.sans}`, writingMode: "vertical-rl", letterSpacing: 1,
          }}
        >
          &#8250; Riders
        </button>
      )}

      <div style={{ flex: 1, position: "relative" }}>
        {organizerEventId && sosEntrants.length > 0 && (
          <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 6, width: "min(92%, 460px)", display: "flex", flexDirection: "column", gap: 6 }}>
            {sosEntrants.map((e) => (
              <div key={e.id} className="wp-pulse" style={{ background: "#FF3B30", color: "#fff", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,.5)" }}>
                <span style={{ fontSize: text.xl }}>&#9888;</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: text.base, letterSpacing: 0.3 }}>SOS — {e.number ? `#${e.number} ` : ""}{e.name}</div>
                  <div style={{ fontSize: text.xs, opacity: 0.85 }}>Tap Locate to see position &amp; ICE.</div>
                </div>
                <button onClick={() => { setSosFocus(e.id); selectEntrant(e.id); }} style={{ background: "#fff", color: "#B3261E", border: "none", borderRadius: 4, padding: "6px 10px", fontSize: text.xs, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Locate</button>
                <button onClick={() => acknowledgeSos(e.id)} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.6)", borderRadius: 4, padding: "6px 10px", fontSize: text.xs, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>Ack</button>
              </div>
            ))}
          </div>
        )}
        <TrackingMap
          entrants={visible}
          routeGpx={event?.route_gpx}
          stages={stages}
          routeName={event?.route_name}
          compact={compact}
          onSelectEntrant={selectEntrant}
          selectedTrack={track}
          organizerEventId={organizerEventId}
          focusEntrantId={sosFocus}
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
