/**
 * Colours for the sub-layers of one uploaded GIS asset.
 *
 * A KML folder is a layer, and one file routinely carries dozens: the KSADP
 * infrastructure export has 31, one per infrastructure type. Painting them all
 * in the asset's single colour throws away the only thing that tells them
 * apart, so each sub-layer gets its own.
 *
 * The source file's own styling is deliberately not used. In that same export
 * the 31 types share one icon (`placemark_circle.png`, on maps.google.com —
 * fetching it would send a map request out of the stack, against ADR 0009) and
 * 25 of them share one magenta; reproducing it faithfully would draw 25
 * indistinguishable markers. A generated palette answers the question the map
 * is actually asked: which type is where.
 *
 * Colours are derived from the sorted position of the layer name, so they are
 * stable across reloads and identical in the map and in the panel beside it.
 */

// Walking the hue wheel by the golden angle puts consecutive entries far
// apart, so even thirty types stay tellable from one another; the lightness
// and saturation cycles separate the neighbours the wheel brings back close.
const GOLDEN_ANGLE = 137.508;

export function layerColor(index) {
  const hue = Math.round((index * GOLDEN_ANGLE) % 360);
  const lightness  = index % 2 ? 42 : 56;
  const saturation = index % 3 ? 68 : 84;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/** The distinct `_layer` values of an asset's features, sorted. */
export function layerNames(geojson) {
  const names = new Set();
  (geojson?.features || []).forEach((f) => {
    const name = f.properties?._layer;
    if (name) names.add(name);
  });
  return [...names].sort();
}

/** How many features each `_layer` holds, for the legend. */
export function layerCounts(geojson) {
  const counts = new Map();
  (geojson?.features || []).forEach((f) => {
    const name = f.properties?._layer;
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  });
  return counts;
}

/**
 * A MapLibre paint value: per-layer colour when the asset has sub-layers,
 * the asset's own colour when it does not. MapLibre parses `hsl()` like any
 * CSS colour, so no conversion is needed.
 */
export function colorExpression(names, fallback) {
  if (!names.length) return fallback;
  const expression = ["match", ["get", "_layer"]];
  names.forEach((name, index) => expression.push(name, layerColor(index)));
  expression.push(fallback);
  return expression;
}
