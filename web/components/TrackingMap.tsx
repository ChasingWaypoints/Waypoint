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
import { authFetch } from "../lib/authFetch";
import {
  LngLat,
  pathLength,
  bearing,
  compassPoint,
  initials,
  allCoordFormats,
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
  linked?: boolean;
}

export interface StageWaypoint {
  lat: number;
  lng: number;
  name: string;
  type: string | null;
  num?: string;
  label?: string;
}

export interface StageLine {
  id: string;
  name: string;
  color: string;
  route_line?: [number, number][];   // [lng,lat] pairs — compact, no GPX
  route_gpx?: string;                // legacy fallback only
  waypoints?: StageWaypoint[];
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
  /** When set, this is the organizer's own view of that event: the popup
   *  gains an Emergency-info button that fetches SAR details for linked
   *  riders. Never pass on public/embed maps. */
  organizerEventId?: string;
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
  organizerEventId,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popup = useRef<mapboxgl.Popup | null>(null);
  const popupHtml = useRef<Map<string, string>>(new Map());
  const didFit = useRef(false);

  const [layerId, setLayerId] = useState<LayerId>(DEFAULT_LAYER);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<LngLat[]>([]);
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [ready, setReady] = useState(false);
  const [weatherRain, setWeatherRain] = useState(false);
  const [weatherTemp, setWeatherTemp] = useState(false);

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
      const label = e.number ? `${e.number}` : initials(e.name);

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
          const id = e.id;
          // While measuring, clicking a rider drops that rider's exact
          // position as a measure point instead of opening the card.
          if (measuringRef.current) {
            const mkm = markers.current.get(id);
            if (mkm) {
              const ll = mkm.getLngLat();
              setMeasurePoints((prev) => [...prev, { lng: ll.lng, lat: ll.lat }]);
            }
            return;
          }
          // Quick-reference popup: name, status, device, coordinates.
          if (!popup.current) {
            popup.current = new mapboxgl.Popup({ offset: 18, closeButton: true, maxWidth: "320px" });
          }
          const html = popupHtml.current.get(id) || "";
          const mk = markers.current.get(id);
          if (mk && html) {
            popup.current.setLngLat(mk.getLngLat()).setHTML(html).addTo(m);
            wireCopyButtons(popup.current.getElement());
            wireEmergencyButtons(popup.current.getElement(), organizerEventId);
            wireWeather(popup.current.getElement());
          }
          onSelectEntrant?.(id);
        });

        markers.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.lng, e.lat]);
      }

      const el = marker.getElement();
      el.style.background = color;
      el.textContent = label;
      el.title = `${e.name}${e.number ? ` #${e.number}` : ""} — ${STATUS_LABEL[status]}`;

      // Precise coordinates are shown only in the organizer's own view.
      // Public spectators get name/class/status but not exact rider positions.
      const coordRows = (organizerEventId && e.lat !== null && e.lng !== null)
        ? allCoordFormats(e.lat, e.lng)
        : [];
      const coordHtml = coordRows.length
        ? `<div style="margin-top:6px;border-top:1px solid #1E3B4C;padding-top:6px">
             ${coordRows.map((c, i) => `
               <div style="display:flex;gap:6px;align-items:center;margin:3px 0">
                 <span style="color:#54697A;font-size:10px;text-transform:uppercase;letter-spacing:.5px;width:44px;flex-shrink:0">${c.label}</span>
                 <code style="flex:1;min-width:0;color:${i === 0 ? "#CCFF00" : "#C8D4DC"};font-size:${i === 0 ? "12px" : "11px"};font-weight:${i === 0 ? 700 : 400};user-select:all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.value}</code>
                 <button class="wp-copy" data-copy="${escapeHtml(c.value)}" title="Copy ${c.label}" aria-label="Copy ${c.label}" style="flex-shrink:0;background:#14303F;color:#C8D4DC;border:1px solid #1E3B4C;border-radius:4px;padding:4px 6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:0">${COPY_ICON}</button>
               </div>`).join("")}
           </div>`
        : "";
      // Live temperature/conditions at this rider, filled in when the popup opens.
      const wxHtml = (e.lat !== null && e.lng !== null)
        ? `<div class="wp-wx" data-lat="${e.lat}" data-lng="${e.lng}" style="margin-top:6px;font-size:12px;color:#9FB2BE"><span style="color:#54697A;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Weather</span> &hellip;</div>`
        : "";
      const popupContent =
        `<div style="font:13px/1.4 system-ui,sans-serif;color:#fff;min-width:210px">
             <strong>${escapeHtml(e.name)}</strong>${e.number ? ` &middot; #${escapeHtml(e.number)}` : ""}
             ${e.class ? `<br><span style="color:#7E93A0">${escapeHtml(e.class)}</span>` : ""}
             <br><span style="color:${color}">&#9679;</span> ${STATUS_LABEL[status]} &middot; ${timeAgo(e.last_seen_at)}
             ${e.device_type ? `<br><span style="color:#54697A">Device: ${escapeHtml(e.device_type)}</span>` : ""}
             ${wxHtml}
             ${coordHtml}
             ${organizerEventId && e.linked ? `<div style="margin-top:8px;border-top:1px solid #1E3B4C;padding-top:8px">
               <button class="wp-emergency" data-id="${e.id}" style="width:100%;background:#2A1214;color:#FF6B6B;border:1px solid #5A2530;border-radius:4px;font:700 11px system-ui;letter-spacing:.5px;text-transform:uppercase;padding:7px;cursor:pointer">&#9888; Emergency info</button>
               <div class="wp-emergency-out" data-id="${e.id}"></div>
             </div>` : ""}
           </div>`;
      popupHtml.current.set(e.id, popupContent);
      // If this entrant's popup is currently open, refresh it in place.
      if (popup.current && popup.current.isOpen()) {
        const open = popup.current.getLngLat();
        if (open && Math.abs(open.lng - e.lng) < 1e-6 && Math.abs(open.lat - e.lat) < 1e-6) {
          popup.current.setHTML(popupContent);
          wireCopyButtons(popup.current.getElement());
          wireEmergencyButtons(popup.current.getElement(), organizerEventId);
        }
      }
    }

    // Remove markers for entrants that dropped out of the payload
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
        popupHtml.current.delete(id);
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
    ? stages.map((s) => s.id + ":" + s.color + ":" + (s.route_line?.length ?? 0)).join("|")
    : routeGpx) ?? "";
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    // Build one line per visible stage; fall back to the single planned route.
    const lines: { id: string; color: string; coords: LngLat[] }[] =
      stages && stages.length
        ? stages.map((st) => ({
          id: st.id,
          color: st.color || theme.route,
          coords: (st.route_line && st.route_line.length)
            ? st.route_line.map(([lng, lat]) => ({ lng, lat }))
            : (st.route_gpx ? parseGPXCoordinates(st.route_gpx) : []),
        }))
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

  // ── Stage waypoints (OpenRally) — labelled pins ───────────────
  const wpKey = (stages && stages.length
    ? stages.map((s) => s.id + ":" + (s.waypoints?.length ?? 0)).join("|")
    : "") ;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const feats = (stages ?? []).flatMap((st) =>
      (st.waypoints ?? []).map((w) => ({
        type: "Feature" as const,
        properties: {
          label: w.label || w.type || w.num || "",
          name: w.name,
          color: st.color || theme.route,
        },
        geometry: { type: "Point" as const, coordinates: [w.lng, w.lat] },
      }))
    );
    const fc = { type: "FeatureCollection" as const, features: feats };

    const src = m.getSource("stage-waypoints") as mapboxgl.GeoJSONSource | undefined;
    if (src) { src.setData(fc); return; }
    if (feats.length === 0) return;

    m.addSource("stage-waypoints", { type: "geojson", data: fc });
    m.addLayer({
      id: "stage-waypoints-dot",
      type: "circle",
      source: "stage-waypoints",
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "color"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0A0A0A",
      },
    });
    m.addLayer({
      id: "stage-waypoints-label",
      type: "symbol",
      source: "stage-waypoints",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true,
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#0A0A0A",
        "text-halo-width": 1.4,
      },
    });
  }, [wpKey, stages, ready, layerId]);

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

  // ── Weather overlay (OpenWeather, proxied) ────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    // Slip weather beneath our own vector overlays so tracks, the planned
    // route and the markers stay readable over the rain/temp wash.
    const OVERLAYS = ["event-route", "entrant-track", "stage-waypoints", "measure-"];
    const beforeId = m.getStyle().layers?.find((l) =>
      OVERLAYS.some((pfx) => l.id.startsWith(pfx))
    )?.id;

    const sync = (id: string, slug: string, on: boolean, opacity: number) => {
      if (on) {
        if (!m.getSource(id)) {
          m.addSource(id, {
            type: "raster",
            tiles: [`/api/weather/${slug}/{z}/{x}/{y}`],
            tileSize: 256,
          });
        }
        if (!m.getLayer(id)) {
          m.addLayer(
            { id, type: "raster", source: id, paint: { "raster-opacity": opacity } },
            beforeId && m.getLayer(beforeId) ? beforeId : undefined
          );
        }
      } else {
        if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource(id)) m.removeSource(id);
      }
    };

    // Temp is the broad colour field; rain sits above it, both under overlays.
    sync("wx-temp", "temp", weatherTemp, 0.72);
    sync("wx-rain", "precipitation", weatherRain, 0.9);
  }, [weatherRain, weatherTemp, ready, layerId]);

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
  // CAP heading is always taken from the FIRST point clicked to the last,
  // so measuring competitor A then B gives A->B relative heading.
  const cap =
    measurePoints.length >= 2
      ? bearing(measurePoints[0], measurePoints[measurePoints.length - 1])
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
          {(weatherRain || weatherTemp) && (
            <span style={{ marginLeft: 6, color: theme.accent, fontSize: 10, fontWeight: 700 }}>● WX</span>
          )}
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
            <div style={{ borderTop: `1px solid ${theme.hairline}`, marginTop: 4 }}>
              <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: theme.muted }}>
                Weather overlay
              </div>
              {([
                ["Rain", weatherRain, () => setWeatherRain((v) => !v)],
                ["Temperature", weatherTemp, () => setWeatherTemp((v) => !v)],
              ] as [string, boolean, () => void][]).map(([label, on, toggle]) => (
                <button
                  key={label}
                  onClick={toggle}
                  style={{
                    ...menuItemStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: on ? theme.surfaceHi : "transparent",
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: on ? theme.accent : theme.muted }}>
                    {on ? "ON" : "OFF"}
                  </span>
                </button>
              ))}
              <div style={{ padding: "4px 12px 8px", fontSize: 10, color: theme.muted }}>
                OpenWeather · refreshes ~10 min
              </div>
            </div>
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
                {cap !== null && (
                  <> &middot; CAP {Math.round(((cap % 360) + 360) % 360)}&deg; {compassPoint(cap)}</>
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

      {/* Temperature legend — the temp tiles are a colour field, so this
          gives the colours meaning. Numeric temps come from the popups. */}
      {!compact && weatherTemp && (
        <div style={{ position: "absolute", bottom: 30, left: 10, zIndex: 2, background: theme.surface, border: `1px solid ${theme.hairline}`, borderRadius: 4, padding: "6px 8px" }}>
          <div style={{ font: `700 9px ${font.sans}`, letterSpacing: 0.6, textTransform: "uppercase", color: theme.muted, marginBottom: 4 }}>
            Temperature
          </div>
          <div style={{ width: 150, height: 8, borderRadius: 2, background: "linear-gradient(90deg,#2b59d6,#23c9e6,#37d13f,#f2e93f,#f5a623,#e6392e)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, font: `9px ${font.sans}`, color: theme.muted }}>
            <span>0°F</span><span>32°</span><span>60°</span><span>100°F</span>
          </div>
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

// Two-overlapping-pages "copy" glyph, and a check for the copied state.
const COPY_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

// Fills the ".wp-wx" line with the current temperature at the rider's
// location. Wired once on open (not on the periodic refresh) so we don't
// re-hit the API every 30s while a popup sits open.
function wireWeather(root: HTMLElement | undefined) {
  if (!root) return;
  const el = root.querySelector<HTMLElement>(".wp-wx");
  if (!el) return;
  const w = el as HTMLElement & { _wired?: boolean };
  if (w._wired) return;
  w._wired = true;
  const lat = el.getAttribute("data-lat");
  const lng = el.getAttribute("data-lng");
  if (!lat || !lng) { el.style.display = "none"; return; }
  fetch(`/api/weather/point?lat=${lat}&lng=${lng}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || d.ok !== true || d.tempF == null) { el.style.display = "none"; return; }
      const desc = d.description ? " &middot; " + escapeHtml(String(d.description)) : "";
      el.innerHTML =
        '<span style="color:#54697A;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Weather</span> '
        + '<strong style="color:#CCFF00">' + Math.round(d.tempF) + "&deg;F</strong> / "
        + Math.round(d.tempC) + "&deg;C" + desc;
    })
    .catch(() => { el.style.display = "none"; });
}

// Attaches copy-to-clipboard to every .wp-copy button inside a popup.
// Copying a coordinate for a rescue crew must give a clear confirmation,
// so the button flips to "Copied ✓" on success.
function wireCopyButtons(root: HTMLElement | undefined) {
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>(".wp-copy").forEach((btn) => {
    if ((btn as HTMLButtonElement & { _wired?: boolean })._wired) return;
    (btn as HTMLButtonElement & { _wired?: boolean })._wired = true;
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const value = btn.getAttribute("data-copy") || "";
      let ok = false;
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          ok = false;
        }
      }
      btn.innerHTML = ok ? CHECK_ICON : COPY_ICON;
      btn.style.color = ok ? "#CCFF00" : "#FF3B30";
      btn.style.borderColor = ok ? "#CCFF00" : "#FF3B30";
      window.setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.style.color = "#C8D4DC";
        btn.style.borderColor = "#1E3B4C";
      }, 1300);
    });
  });
}

// Organizer-only: fetch and reveal a linked rider's emergency details.
function emgErrBox(msg: string): string {
  return '<div style="margin-top:6px;color:#7E93A0;font-size:12px">' + msg + '</div>';
}
function emgLine(label: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  return '<div style="display:flex;gap:8px;margin:2px 0"><span style="color:#54697A;font-size:10px;text-transform:uppercase;letter-spacing:.5px;width:82px;flex-shrink:0">'
    + label + '</span><span style="color:#fff;font-size:12px">' + escapeHtml(String(val)) + '</span></div>';
}
function renderEmergency(d: Record<string, unknown>): string {
  let age = "";
  const dobRaw = d.date_of_birth ? String(d.date_of_birth) : "";
  if (dobRaw) {
    const dob = new Date(dobRaw + "T00:00:00");
    if (!isNaN(dob.getTime())) {
      const n = new Date();
      let a = n.getFullYear() - dob.getFullYear();
      const m = n.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && n.getDate() < dob.getDate())) a--;
      if (a >= 0 && a < 130) age = String(a);
    }
  }
  const contact = d.emergency_contact_name || d.emergency_contact_phone;
  return '<div style="margin-top:6px;background:#1A0E10;border:1px solid #5A2530;border-radius:4px;padding:8px 10px">'
    + emgLine("Name", d.name)
    + emgLine("Blood type", d.blood_type)
    + (age ? emgLine("Age", age) : "")
    + emgLine("Phone", d.phone)
    + emgLine("Country", d.country)
    + (contact
        ? '<div style="border-top:1px solid #5A2530;margin-top:6px;padding-top:6px">'
          + '<div style="color:#FF6B6B;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Emergency contact</div>'
          + emgLine("Name", d.emergency_contact_name)
          + emgLine("Relation", d.emergency_contact_relation)
          + emgLine("Phone", d.emergency_contact_phone)
          + '</div>'
        : "")
    + '</div>';
}
function wireEmergencyButtons(root: HTMLElement | undefined, eventId: string | undefined) {
  if (!root || !eventId) return;
  root.querySelectorAll<HTMLButtonElement>(".wp-emergency").forEach((btn) => {
    const b = btn as HTMLButtonElement & { _wired?: boolean };
    if (b._wired) return;
    b._wired = true;
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.getAttribute("data-id") || "";
      const out = root.querySelector<HTMLElement>('.wp-emergency-out[data-id="' + id + '"]');
      const label = btn.innerHTML;
      btn.textContent = "Loading\u2026";
      btn.disabled = true;
      try {
        const res = await authFetch(`/api/events/${eventId}/entrants/${id}/emergency`);
        const d = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          if (out) out.innerHTML = emgErrBox("Could not load emergency info.");
          btn.innerHTML = label;
          btn.disabled = false;
          return;
        }
        if (d.linked === false) {
          if (out) out.innerHTML = emgErrBox("No linked Waypoint account for this rider.");
          btn.style.display = "none";
          return;
        }
        if (out) out.innerHTML = renderEmergency(d);
        btn.style.display = "none";
      } catch {
        if (out) out.innerHTML = emgErrBox("Network error.");
        btn.innerHTML = label;
        btn.disabled = false;
      }
    });
  });
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
