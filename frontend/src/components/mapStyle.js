/**
 * mapStyle — the basemap shared by ProjectMap and PortfolioMap.
 *
 * Every source is a Martin vector tile set from PostGIS (see
 * infra/martin/config.yaml): Natural Earth countries (50m below zoom 5, 10m
 * from zoom 5), country label points, populated places, lakes, and the GADM
 * Admin 1 outlines. Look: a reduced CARTO Voyager, as in the LLF portfolio
 * map mockup — warm land, soft blue water, lavender borders — kept light so
 * the project circles and sector colours stay the loudest thing on the map.
 */

export const MARTIN_URL = "/martin";
// The first layer above the basemap; project overlays insert below it so
// labels stay readable.
export const LABELS_LAYER_ID = "lake-labels";
export const ATTRIBUTION = "© Natural Earth · GADM · aRBM-MIS";

const WATER = "#C9DEEA";
const LAND = "#F8F5EF";
const BORDER = "#C3B6CF";
const ADMIN1 = "#E3DCE8";
const LABEL = "#7D7390";
const LABEL_DARK = "#3F4650";
const LABEL_MID = "#5E6670";
const LAKE_LABEL = "#5E93B0";
const HALO = "#FFFFFF";

const FONT = ["Noto Sans Regular"];
const FONT_ITALIC = ["Noto Sans Italic"];

// The country-resolution switch: 50m tiles are much lighter and look the
// same at world scale; 10m coastlines matter once a project is in view.
const SWITCH_ZOOM = 5;

function martin(source, minzoom, maxzoom) {
  return {
    type: "vector",
    tiles: [`${MARTIN_URL}/${source}/{z}/{x}/{y}`],
    minzoom,
    maxzoom,
  };
}

const textHalo = { "text-halo-color": HALO, "text-halo-width": 1.5 };

function cityBands(bands) {
  return bands.flatMap(([minzoom, maxzoom, maxMinZoom]) => {
    const filter = ["all",
      ["!", ["get", "is_capital"]],
      ["<=", ["get", "min_zoom"], maxMinZoom]];
    const suffix = `${minzoom}`;
    return [
      { id: `place-city-dot-${suffix}`, type: "circle", source: "ne-place", "source-layer": "ne_place",
        minzoom, maxzoom, filter,
        paint: { "circle-radius": 2, "circle-color": LABEL,
                 "circle-stroke-color": HALO, "circle-stroke-width": 1 } },
      { id: `place-city-${suffix}`, type: "symbol", source: "ne-place", "source-layer": "ne_place",
        minzoom, maxzoom, filter,
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 9, 13],
          "text-anchor": "left",
          "text-offset": [0.6, 0],
          "text-padding": 4,
          "symbol-sort-key": ["get", "scalerank"],
        },
        paint: { "text-color": LABEL_MID, ...textHalo } },
    ];
  });
}

export const BASEMAP_STYLE = {
  version: 8,
  // Glyphs are served from frontend/public/fonts, not from
  // fonts.openmaptiles.org: the map must label itself offline. Only the
  // ranges the label data uses are shipped — see public/fonts/README.md.
  glyphs: "/fonts/{fontstack}/{range}.pbf",
  sources: {
    "ne-country-50m": martin("ne_country_50m", 0, 5),
    "ne-country-10m": martin("ne_country_10m", 4, 10),
    "ne-country-label": martin("ne_country_label", 1, 10),
    "ne-place": martin("ne_place", 2, 12),
    "ne-lake": martin("ne_lake", 3, 12),
    "martin-gadm": martin("gadm_area", 2, 12),
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": WATER } },

    { id: "land-50m-fill", type: "fill", source: "ne-country-50m", "source-layer": "ne_country_50m",
      maxzoom: SWITCH_ZOOM,
      paint: { "fill-color": LAND } },
    { id: "land-10m-fill", type: "fill", source: "ne-country-10m", "source-layer": "ne_country_10m",
      minzoom: SWITCH_ZOOM,
      paint: { "fill-color": LAND } },

    { id: "lakes-fill", type: "fill", source: "ne-lake", "source-layer": "ne_lake",
      minzoom: 3,
      paint: { "fill-color": WATER } },

    // Admin 1 GADM: transparent fill is the hover target in ProjectMap.
    { id: "gadm-admin1-fill", type: "fill", source: "martin-gadm", "source-layer": "gadm_area",
      filter: ["==", ["get", "level"], 1],
      paint: { "fill-color": LAND, "fill-opacity": 0 } },
    { id: "gadm-admin1-line", type: "line", source: "martin-gadm", "source-layer": "gadm_area",
      minzoom: 4, filter: ["==", ["get", "level"], 1],
      paint: { "line-color": ADMIN1, "line-width": 0.5 } },

    { id: "land-50m-border", type: "line", source: "ne-country-50m", "source-layer": "ne_country_50m",
      maxzoom: SWITCH_ZOOM,
      paint: { "line-color": BORDER,
               "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.4] } },
    { id: "land-10m-border", type: "line", source: "ne-country-10m", "source-layer": "ne_country_10m",
      minzoom: SWITCH_ZOOM,
      paint: { "line-color": BORDER,
               "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.4] } },

    { id: "lake-labels", type: "symbol", source: "ne-lake", "source-layer": "ne_lake",
      minzoom: 6, filter: ["!=", ["get", "name"], ""],
      layout: {
        "symbol-placement": "point",
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC,
        "text-size": 11,
        "text-padding": 6,
      },
      paint: { "text-color": LAKE_LABEL, ...textHalo } },

    // Cities in zoom bands (a filter cannot read the zoom itself, so each
    // band is a layer). Natural Earth's min_zoom hint drives the bands;
    // symbol-sort-key gives big cities priority when labels collide.
    ...cityBands([[5, 7, 6], [7, 9, 8], [9, 24, 99]]),

    { id: "place-capital-dot", type: "circle", source: "ne-place", "source-layer": "ne_place",
      minzoom: 3, filter: ["get", "is_capital"],
      paint: { "circle-radius": 3, "circle-color": LABEL_MID,
               "circle-stroke-color": HALO, "circle-stroke-width": 1 } },
    { id: "place-capital", type: "symbol", source: "ne-place", "source-layer": "ne_place",
      minzoom: 3, filter: ["get", "is_capital"],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 13],
        "text-anchor": "left",
        "text-offset": [0.7, 0],
        "text-padding": 4,
        "symbol-sort-key": ["get", "scalerank"],
      },
      paint: { "text-color": LABEL_DARK, ...textHalo } },

    // One label set per resolution, matching the fill switch.
    ...[[50, 1, SWITCH_ZOOM], [10, SWITCH_ZOOM, 9]].map(([scale, minzoom, maxzoom]) => ({
      id: `country-labels-${scale}m`, type: "symbol", source: "ne-country-label",
      "source-layer": "ne_country_label",
      minzoom, maxzoom,
      filter: ["==", ["get", "scale"], scale],
      layout: {
        "symbol-placement": "point",
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.1,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 6, 13],
        "text-padding": 4,
        "text-max-width": 7,
        "symbol-sort-key": ["get", "scalerank"],
      },
      paint: { "text-color": LABEL, ...textHalo },
    })),
  ],
};
