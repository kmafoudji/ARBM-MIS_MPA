/**
 * Tones for the sub-layers of one uploaded GIS asset.
 *
 * A KML folder is a layer, and one file routinely carries dozens: the KSADP
 * infrastructure export has 31, one per infrastructure type.
 *
 * WHY TONES AND NOT HUES. Thirty-one categories cannot be told apart by colour
 * under any palette, so colour must not carry identity here — the legend and
 * the record popup do that. A fan of generated hues would also break
 * docs/design.md twice over: "no colours outside the palette" and "multi-value
 * data uses the LLF tonal scales". So there is ONE hue — the asset's own
 * colour, Growth Green by default — and the tone carries a real attribute:
 * how many features the sub-layer holds. Dark means many, light means few.
 *
 * The source file's own styling is deliberately unused. In that same export the
 * 31 types share one icon (`placemark_circle.png`, on maps.google.com —
 * fetching it would send a map request out of the stack, against ADR 0009) and
 * 25 of them share one magenta.
 *
 * The five steps are validated: every one clears 3:1 against the map surface
 * and the lightness descends monotonically, which is what a sequential ramp
 * owes. Adjacent steps are close on purpose — that is what "same colour,
 * several tones" means, and why identity lives in the legend.
 */

// Saturation and lightness of the validated Growth Green ramp
// (#1BA37B · #0E8B69 · #0A7356 · #075B43 · #054530), light end first. Applied
// to whatever hue the asset carries, so a re-coloured layer keeps the ladder.
const RAMP = [
  { s: 72, l: 37 },
  { s: 82, l: 30 },
  { s: 84, l: 25 },
  { s: 86, l: 19 },
  { s: 87, l: 15 },
];

export const DEFAULT_LAYER_COLOR = "#0EB584";  // --lime, Growth Green

/** Hue of a #rrggbb colour, 0–360. Falls back to Growth Green's. */
export function hueOf(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!match) return 162;
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return 162;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  return hue < 0 ? hue + 360 : hue;
}

export function rampStep(hue, index) {
  const step = RAMP[Math.min(Math.max(index, 0), RAMP.length - 1)];
  return `hsl(${hue}, ${step.s}%, ${step.l}%)`;
}

/** How many features each `_layer` holds. */
export function layerCounts(geojson) {
  const counts = new Map();
  (geojson?.features || []).forEach((f) => {
    const name = f.properties?._layer;
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  });
  return counts;
}

/**
 * The sub-layers of an asset, ordered by size, each with its tone.
 *
 * Bands are assigned by rank rather than by raw count: these distributions are
 * skewed (28 milk collection centres against a single flour mill), and a
 * linear mapping would leave every small type in the same pale step.
 */
export function layerScale(geojson, baseColor) {
  const counts = layerCounts(geojson);
  const names = [...counts.keys()].sort(
    (a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b),
  );
  const hue = hueOf(baseColor || DEFAULT_LAYER_COLOR);

  const color = new Map();
  names.forEach((name, index) => {
    // Darkest band first: the biggest types carry the most weight on the map.
    const band = names.length < 2
      ? RAMP.length - 1
      : RAMP.length - 1 - Math.floor((index * RAMP.length) / names.length);
    color.set(name, rampStep(hue, band));
  });

  return { names, counts, color };
}

/**
 * A MapLibre paint value: the sub-layer's tone when the asset has sub-layers,
 * the asset's own colour when it does not. MapLibre parses `hsl()` like any
 * CSS colour, so no conversion is needed.
 */
export function colorExpression(scale, fallback) {
  if (!scale.names.length) return fallback;
  const expression = ["match", ["get", "_layer"]];
  scale.names.forEach((name) => expression.push(name, scale.color.get(name)));
  expression.push(fallback);
  return expression;
}
