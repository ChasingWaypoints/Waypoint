import type { StyleSpecification } from "mapbox-gl";

/**
 * Base layers for the tracking map.
 *
 * Esri World Imagery is the default because it is generally sharper and
 * more recently flown than Mapbox Satellite over the remote desert and
 * mountain terrain these events run in — Baja, Sonora, the Mojave.
 * It is served as a plain XYZ raster, so it drops straight into Mapbox
 * GL with no extra SDK and no API key.
 *
 * Attribution is required and is rendered by the map component.
 */

export type LayerId =
  | "esri-imagery"
  | "esri-imagery-labels"
  | "mapbox-satellite"
  | "usgs-topo"
  | "opentopo"
  | "streets";

export interface BaseLayer {
  id: LayerId;
  name: string;
  description: string;
  /** Raster layers define tiles; vector layers reference a Mapbox style. */
  tiles?: string[];
  mapboxStyle?: string;
  /** Extra transparent raster drawn on top (place labels, roads). */
  overlayTiles?: string[];
  attribution: string;
  maxzoom: number;
}

export const BASE_LAYERS: BaseLayer[] = [
  {
    id: "esri-imagery",
    name: "Satellite",
    description: "Esri World Imagery — sharpest and most recent in remote terrain",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxzoom: 19,
  },
  {
    id: "esri-imagery-labels",
    name: "Satellite + Labels",
    description: "Esri imagery with place names and roads drawn over it",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    overlayTiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxzoom: 19,
  },
  {
    id: "mapbox-satellite",
    name: "Satellite (Mapbox)",
    description: "Mapbox Satellite — useful as a second opinion where Esri is cloudy or dated",
    mapboxStyle: "mapbox://styles/mapbox/satellite-streets-v12",
    attribution: "&copy; Mapbox &copy; Maxar",
    maxzoom: 22,
  },
  {
    id: "usgs-topo",
    name: "USGS Topo",
    description: "USGS topographic quads — United States only",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "&copy; USGS The National Map",
    maxzoom: 16,
  },
  {
    id: "opentopo",
    name: "Topographic",
    description: "OpenTopoMap — contour lines, worldwide",
    tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: "&copy; OpenTopoMap, &copy; OpenStreetMap contributors (CC-BY-SA)",
    maxzoom: 17,
  },
  {
    id: "streets",
    name: "Streets",
    description: "Standard road map — best for staging areas and transit sections",
    mapboxStyle: "mapbox://styles/mapbox/outdoors-v12",
    attribution: "&copy; Mapbox &copy; OpenStreetMap",
    maxzoom: 22,
  },
];

export const DEFAULT_LAYER: LayerId = "esri-imagery-labels";

export function getLayer(id: LayerId): BaseLayer {
  return BASE_LAYERS.find((l) => l.id === id) ?? BASE_LAYERS[0];
}

/**
 * Builds a self-contained raster style. Used for every non-Mapbox layer
 * so the map never depends on a Mapbox style being reachable.
 */
export function rasterStyle(layer: BaseLayer): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    base: {
      type: "raster",
      tiles: layer.tiles!,
      tileSize: 256,
      maxzoom: layer.maxzoom,
      attribution: layer.attribution,
    },
  };

  const layers: StyleSpecification["layers"] = [
    { id: "base", type: "raster", source: "base" },
  ];

  if (layer.overlayTiles) {
    sources.baseOverlay = {
      type: "raster",
      tiles: layer.overlayTiles,
      tileSize: 256,
      maxzoom: layer.maxzoom,
    };
    layers.push({ id: "base-overlay", type: "raster", source: "baseOverlay" });
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const glyphs = token
    ? `https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=${token}`
    : undefined;
  return { version: 8, sources, layers, glyphs } as StyleSpecification;
}
