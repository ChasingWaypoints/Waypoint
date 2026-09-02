import type { Map as MapboxMap, StyleSpecification, IControl } from "mapbox-gl";

/**
 * Reusable basemap layer + switcher for any existing Mapbox GL map.
 *
 * Technique: instead of swapping the map style (which drops every overlay
 * source/layer the page added), we render each basemap as a raster layer at
 * the BOTTOM of the style and toggle visibility. Routes, tracks and markers
 * the page adds sit above and are never touched by a basemap change.
 *
 * Esri World Imagery is the default because it is the sharpest, most recent
 * coverage over the remote terrain these events run in. All tile sources are
 * keyless.
 */

export const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0A0A0A" } },
  ],
};

interface Basemap {
  id: string;
  label: string;
  tiles: string[];
  maxzoom: number;
  attribution: string;
  /** drawn on top of the imagery (place labels) */
  overlay?: string[];
  default?: boolean;
}

const BASEMAPS: Basemap[] = [
  {
    id: "satellite",
    label: "Satellite",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    overlay: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 19,
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    default: true,
  },
  {
    id: "topo",
    label: "Topo",
    tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
    maxzoom: 17,
    attribution: "&copy; OpenTopoMap (CC-BY-SA)",
  },
  {
    id: "streets",
    label: "Streets",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    maxzoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  },
];

class BasemapControl implements IControl {
  private map?: MapboxMap;
  private container?: HTMLDivElement;

  onAdd(map: MapboxMap): HTMLElement {
    this.map = map;
    const el = document.createElement("div");
    el.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    el.style.cssText =
      "display:flex;overflow:hidden;font:600 12px system-ui,sans-serif;";
    BASEMAPS.forEach((b, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.label;
      btn.style.cssText =
        "border:none;padding:6px 12px;cursor:pointer;background:" +
        (b.default ? "#CCFF00" : "#0C1E29") +
        ";color:" + (b.default ? "#0C1E29" : "#C8D4DC") +
        (i ? ";border-left:1px solid #1E3B4C" : "");
      btn.addEventListener("click", () => this.select(b.id, el));
      el.appendChild(btn);
    });
    this.container = el;
    return el;
  }

  private select(id: string, el: HTMLElement) {
    const map = this.map;
    if (!map) return;
    BASEMAPS.forEach((b, i) => {
      const on = b.id === id;
      if (map.getLayer(`basemap-${b.id}`)) {
        map.setLayoutProperty(`basemap-${b.id}`, "visibility", on ? "visible" : "none");
      }
      if (b.overlay && map.getLayer(`basemap-${b.id}-labels`)) {
        map.setLayoutProperty(`basemap-${b.id}-labels`, "visibility", on ? "visible" : "none");
      }
      const btn = el.children[i] as HTMLButtonElement;
      btn.style.background = on ? "#CCFF00" : "#0C1E29";
      btn.style.color = on ? "#0C1E29" : "#C8D4DC";
    });
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.map = undefined;
  }
}

/**
 * Adds the basemap raster layers (beneath everything) and the switcher
 * control. Call inside the map's `load` handler, before the page adds its
 * own overlay sources/layers.
 */
export function installBasemaps(map: MapboxMap): void {
  for (const b of BASEMAPS) {
    if (!map.getSource(`basemap-${b.id}`)) {
      map.addSource(`basemap-${b.id}`, {
        type: "raster",
        tiles: b.tiles,
        tileSize: 256,
        maxzoom: b.maxzoom,
        attribution: b.attribution,
      });
    }
    map.addLayer({
      id: `basemap-${b.id}`,
      type: "raster",
      source: `basemap-${b.id}`,
      layout: { visibility: b.default ? "visible" : "none" },
    });
    if (b.overlay) {
      if (!map.getSource(`basemap-${b.id}-labels`)) {
        map.addSource(`basemap-${b.id}-labels`, {
          type: "raster",
          tiles: b.overlay,
          tileSize: 256,
          maxzoom: b.maxzoom,
        });
      }
      map.addLayer({
        id: `basemap-${b.id}-labels`,
        type: "raster",
        source: `basemap-${b.id}-labels`,
        layout: { visibility: b.default ? "visible" : "none" },
      });
    }
  }
  map.addControl(new BasemapControl(), "top-left");
}
