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

  private menuOpen = false;

  onAdd(map: MapboxMap): HTMLElement {
    this.map = map;
    const wrap = document.createElement("div");
    wrap.className = "mapboxgl-ctrl";
    wrap.style.cssText =
      "position:relative;font:600 12px system-ui,sans-serif;pointer-events:auto;";

    const current = BASEMAPS.find((b) => b.default) ?? BASEMAPS[0];

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.style.cssText =
      "display:flex;align-items:center;gap:8px;width:auto;min-width:0;height:auto;" +
      "border:1px solid #1E3B4C;border-radius:4px;padding:7px 12px;cursor:pointer;" +
      "background:#0C1E29;color:#fff;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.5);";
    trigger.innerHTML =
      `<span data-label>${current.label}</span><span style="opacity:.6">\u25be</span>`;

    const menu = document.createElement("div");
    menu.style.cssText =
      "position:absolute;top:100%;left:0;margin-top:4px;min-width:120px;" +
      "background:#0C1E29;border:1px solid #1E3B4C;border-radius:4px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.55);overflow:hidden;display:none;z-index:5;";

    BASEMAPS.forEach((b) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = b.label;
      item.dataset.id = b.id;
      item.style.cssText =
        "display:block;width:100%;text-align:left;border:none;padding:9px 12px;" +
        "cursor:pointer;background:" + (b.default ? "#14303F" : "transparent") +
        ";color:" + (b.default ? "#CCFF00" : "#C8D4DC") + ";";
      item.addEventListener("click", () => {
        this.select(b.id, menu, trigger);
        this.toggle(menu, trigger, false);
      });
      menu.appendChild(item);
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle(menu, trigger, !this.menuOpen);
    });
    document.addEventListener("click", () => this.toggle(menu, trigger, false));

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    this.container = wrap;
    return wrap;
  }

  private toggle(menu: HTMLElement, trigger: HTMLElement, open: boolean) {
    this.menuOpen = open;
    menu.style.display = open ? "block" : "none";
  }

  private select(id: string, menu: HTMLElement, trigger: HTMLElement) {
    const map = this.map;
    if (!map) return;
    BASEMAPS.forEach((b) => {
      const on = b.id === id;
      if (map.getLayer(`basemap-${b.id}`)) {
        map.setLayoutProperty(`basemap-${b.id}`, "visibility", on ? "visible" : "none");
      }
      if (b.overlay && map.getLayer(`basemap-${b.id}-labels`)) {
        map.setLayoutProperty(`basemap-${b.id}-labels`, "visibility", on ? "visible" : "none");
      }
    });
    const label = trigger.querySelector("[data-label]");
    const chosen = BASEMAPS.find((b) => b.id === id);
    if (label && chosen) label.textContent = chosen.label;
    menu.querySelectorAll("button").forEach((el) => {
      const item = el as HTMLButtonElement;
      const on = item.dataset.id === id;
      item.style.background = on ? "#14303F" : "transparent";
      item.style.color = on ? "#CCFF00" : "#C8D4DC";
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
