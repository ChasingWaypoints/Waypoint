"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  BASE_LAYERS,
  DEFAULT_LAYER,
  LayerId,
  getLayer,
  rasterStyle,
} from "../lib/mapLayers";
import { theme, font, btnMap, panel } from "../lib/theme";
import {
  LngLat,
  pathLength,
  bearing,
  compassPoint,
  formatDistance,
  timeAgo,
  boundsOf,
  parseGPXCoordinates,
} from "../lib/geo";

export interface Entrant {
  id: string;
  name: string;
  number: string | null;
  class: string | null;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  device_type: string | null;
}

export interface StageLine {
  id: string;
  name: string;
  route_gpx: string;
  color: string;
}

interface Props {
  entrants: Entrant[];
  routeGpx?: string | null;
  routeName?: string | null;
  /** Visible stages, each drawn as its own coloured line. Overrides routeGpx. */
  stages?: StageLine[];
  /** Hides the sidebar and trims chrome — used by the embed view. */
  compact?: boolean;
  onSelectEntrant?: (id: string) => void;
  selectedTrack?: LngLat[];
}

type Status = "live" | "stale" | "dark" | "no_fix";

function statusOf(lastSeen: string | null): Status {
  if (!lastSeen) return "no_fix";
  const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (mins <= 15) return "live";
  if (mins <= 60) return "stale";
  return "dark";
}

const STATUS_COLOR: Record<Status, string> = {
  live: theme.live,
  stale: theme.stale,
  dark: theme.dark,
  no_fix: theme.noFix,
};

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  stale: "Stale",
  dark: "No signal",
  no_fix: "No fix yet",
};

export default function TrackingMap({
  entrants,
  routeGpx,
  routeName,
  stages,
  compact = false,
  onSelectEntrant,
  selectedTrack,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const didFit = useRef(false);

  const [layerId, setLayerId] = useState<LayerId>(DEFAULT_LAYER);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<LngLat[]>([]);
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [ready, setReady] = useState(false);

  // Keep the latest measuring state reachable from the map click handler,
  // which is registered once and would otherwise close over a stale value.
  const measuringRef = useRef(measuring);
  useEffect(() => {
    measuringRef.current = measuring;
  }, [measuring]);

  // ── Initialise the map ────────────────────────────────────────
  useEffect(() => {
    if (map.current || !container.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (token) mapboxgl.accessToken = token;

    const layer = getLayer(DEFAULT_LAYER);
    map.current = new mapboxgl.Map({
      container: container.current,
      style: layer.mapboxStyle ?? rasterStyle(layer),
      center: [-115.5, 30.5], // Baja — sensible default for this audience
      zoom: 5,
      attributionControl: true,
    });

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.current.addControl(
      new mapboxgl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left"
    );

    map.current.on("load", () => setReady(true));

    map.current.on("click", (e) => {
      if (!measuringRef.current) return;
      setMeasurePoints((prev) => [...prev, { lng: e.lngLat.lng, lat: e.lngLat.lat }]);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // ── Swap base layer without losing overlays ───────────────────
  const applyLayer = useCallback((id: LayerId) => {
    const m = map.current;
    if (!m) return;
    const layer = getLayer(id);
    setReady(false);
    m.setStyle(layer.mapboxStyle ?? rasterStyle(layer));
    m.once("styledata", () => setReady(true));
    setLayerId(id);
    setLayerMenuOpen(false);
  }, []);

  // ── Entrant markers ───────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const seen = new Set<string>();

    for (const e of entrants) {
      if (e.lat === null || e.lng === null) continue;
      seen.add(e.id);

      const status = statusOf(e.last_seen_at);
      const color = STATUS_COLOR[status];
      const label = e.number ? `${e.number}` : e.name.slice(0, 2).toUpperCase();

      let marker = markers.current.get(e.id);

      if (!marker) {
        const el = document.createElement("div");
        el.className = "wp-marker";
        el.style.cssText =
          "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;" +
          "justify-content:center;font:700 11px/1 system-ui,sans-serif;color:#0A0A0A;" +
          "border:2px solid rgba(10,10,10,.85);box-shadow:0 2px 6px rgba(0,0,0,.7);cursor:pointer;";

        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([e.lng, e.lat])
          .addTo(m);

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectEntrant?.(e.id);
        });

        markers.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.lng, e.lat]);
      }

      const el = marker.getElement();
      el.style.background = color;
      el.textContent = label;
      el.title = `${e.name}${e.number ? ` #${e.number}` : ""} — ${STATUS_LABEL[status]}`;

      marker.setPopup(
        new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<div style="font:13px/1.4 system-ui,sans-serif;color:#fff">
             <strong>${escapeHtml(e.name)}</strong>${e.number ? ` &middot; #${escapeHtml(e.number)}` : ""}
             ${e.class ? `<br><span style="color:#7E93A0">${escapeHtml(e.class)}</span>` : ""}
             <br><span style="color:${color}">&#9679;</span> ${STATUS_LABEL[status]} &middot; ${timeAgo(e.last_seen_at)}
             ${e.device_type ? `<br><span style="color:#54697A">${escapeHtml(e.device_type)}</span>` : ""}
           </div>`
        )
      );
    }

    // Remove markers for entrants that dropped out of the payload
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    // Fit once, on the first batch that has positions
    if (!didFit.current) {
      const pts = entrants
        .filter((e) => e.lat !== null && e.lng !== null)
        .map((e) => ({ lat: e.lat!, lng: e.lng! }));
      const b = boundsOf(pts);
      if (b) {
        m.fitBounds(b, { padding: 80, maxZoom: 13, duration: 0 });
        didFit.current = true;
      }
    }
  }, [entrants, onSelectEntrant]);

  // ── Event route from the organizer's GPX ──────────────────────
  const routeKey = (stages && stages.length
    ? stages.map((s) => s.id + ":" + s.color).join("|")
    : routeGpx) ?? "";
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    // Build one line per visible stage; fall back to the single planned route.
    const lines: { id: string; color: string; coords: LngLat[] }[] =
      stages && stages.length
        ? stages.map((st) => ({ id: st.id, color: st.color || theme.route, coords: parseGPXCoordinates(st.route_gpx) }))
        : routeGpx
          ? [{ id: "route", color: theme.route, coords: parseGPXCoordinates(routeGpx) }]
          : [];

    const fc = {
      type: "FeatureCollection" as const,
      features: lines
        .filter((l) => l.coords.length > 0)
        .map((l) => ({
          type: "Feature" as const,
          properties: { color: l.color },
          geometry: { type: "LineString" as const, coordinates: l.coords.map((c) => [c.lng, c.lat]) },
        })),
    };

    const existing = m.getSource("event-route") as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(fc);
      return;
    }
    if (fc.features.length === 0) return;

    m.addSource("event-route", { type: "geojson", data: fc });
    m.addLayer({
      id: "event-route-casing",
      type: "line",
      source: "event-route",
      paint: { "line-color": theme.trackCasing, "line-width": 6, "line-opacity": 0.5 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    m.addLayer({
      id: "event-route-line",
      type: "line",
      source: "event-route",
      paint: { "line-color": ["get", "color"], "line-width": 3 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }, [routeKey, routeGpx, stages, ready, layerId]);

  // ── Selected entrant's breadcrumb trail ───────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const coords = selectedTrack ?? [];
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coords.map((c) => [c.lng, c.lat]),
      },
    };

    const existing = m.getSource("entrant-track") as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    if (coords.length === 0) return;

    m.addSource("entrant-track", { type: "geojson", data });
    m.addLayer({
      id: "entrant-track-line",
      type: "line",
      source: "entrant-track",
      paint: { "line-color": theme.track, "line-width": 3.5 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }, [selectedTrack, ready, layerId]);

  // ── Measurement overlay ───────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const line = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: measurePoints.map((p) => [p.lng, p.lat]),
      },
    };
    const dots = {
      type: "FeatureCollection" as const,
      features: measurePoints.map((p) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    };

    const lineSrc = m.getSource("measure-line") as mapboxgl.GeoJSONSource | undefined;
    const dotSrc = m.getSource("measure-dots") as mapboxgl.GeoJSONSource | undefined;

    if (lineSrc && dotSrc) {
      lineSrc.setData(line);
      dotSrc.setData(dots);
      return;
    }

    m.addSource("measure-line", { type: "geojson", data: line });
    m.addSource("measure-dots", { type: "geojson", data: dots });
    m.addLayer({
      id: "measure-line",
      type: "line",
      source: "measure-line",
      paint: { "line-color": theme.measure, "line-width": 2, "line-dasharray": [2, 1] },
    });
    m.addLayer({
      id: "measure-dots",
      type: "circle",
      source: "measure-dots",
      paint: {
        "circle-radius": 5,
        "circle-color": theme.measure,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0A0A0A",
      },
    });
  }, [measurePoints, ready, layerId]);

  // Change the cursor so it's obvious the map is in measure mode
  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = measuring ? "crosshair" : "";
  }, [measuring]);

  const total = pathLength(measurePoints);
  const leg =
    measurePoints.length >= 2
      ? bearing(measurePoints[measurePoints.length - 2], measurePoints[measurePoints.length - 1])
      : null;

  const attribution = getLayer(layerId).attribution;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={container} style={{ width: "100%", height: "100%" }} />

      {/* Layer switcher */}
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 2 }}>
        <button
          onClick={() => setLayerMenuOpen((o) => !o)}
          style={btnStyle}
          aria-expanded={layerMenuOpen}
        >
          {getLayer(layerId).name}
          <span style={{ marginLeft: 6, opacity: 0.6 }}>▾</span>
        </button>

        {layerMenuOpen && (
          <div style={panelStyle}>
            {BASE_LAYERS.map((l) => (
              <button
                key={l.id}
                onClick={() => applyLayer(l.id)}
                style={{
                  ...menuItemStyle,
                  background: l.id === layerId ? theme.surfaceHi : "transparent",
                  fontWeight: l.id === layerId ? 600 : 400,
                }}
              >
                <div>{l.name}</div>
                <div style={{ fontSize: 11, color: theme.muted, marginTop: 2 }}>
                  {l.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Measure tool */}
      {!compact && (
        <div style={{ position: "absolute", top: 10, left: 150, zIndex: 2 }}>
          <button
            onClick={() => {
              setMeasuring((v) => !v);
              if (measuring) setMeasurePoints([]);
            }}
            style={{
              ...btnStyle,
              background: measuring ? theme.measure : theme.surface,
              color: measuring ? "#fff" : theme.ink,
            }}
          >
            {measuring ? "Measuring — click to add" : "Measure"}
          </button>

          {measuring && measurePoints.length > 0 && (
            <div style={{ ...panelStyle, minWidth: 190, padding: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.accent }}>
                {formatDistance(total, unit)}
              </div>
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
                {measurePoints.length} point{measurePoints.length === 1 ? "" : "s"}
                {leg !== null && (
                  <> &middot; {compassPoint(leg)} {Math.round(((leg % 360) + 360) % 360)}&deg;</>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button onClick={() => setUnit(unit === "km" ? "mi" : "km")} style={smallBtn}>
                  {unit === "km" ? "Show miles" : "Show km"}
                </button>
                <button onClick={() => setMeasurePoints([])} style={smallBtn}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attribution for non-Mapbox rasters */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          zIndex: 2,
          background: "rgba(10,10,10,.7)",
          font: "10px/1.4 system-ui,sans-serif",
          color: theme.muted,
          padding: "2px 6px",
          maxWidth: "60%",
        }}
        dangerouslySetInnerHTML={{ __html: attribution }}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

const btnStyle = btnMap;

const panelStyle = panel;

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 12px",
  border: "none",
  borderBottom: `1px solid ${theme.hairlineSoft}`,
  font: `13px ${font.sans}`,
  color: theme.ink,
  cursor: "pointer",
};

const smallBtn: React.CSSProperties = {
  flex: 1,
  background: theme.surfaceHi,
  color: theme.body,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 3,
  padding: "5px 8px",
  font: "12px system-ui,sans-serif",
  cursor: "pointer",
};
