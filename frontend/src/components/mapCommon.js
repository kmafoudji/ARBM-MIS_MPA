/**
 * What both maps do the same way.
 *
 * ProjectMap and PortfolioMap are separate screens with separate data, but a
 * handful of MapLibre habits have to hold in both. Every one of them written
 * twice has already drifted once: the card drag lost its close button on one
 * side (mapCardDrag.js), the style guard below kept its bug on one side, and
 * the control chrome was styled twice with different values. Each rule lives
 * here so there is one place to be right.
 */
import { useEffect, useState } from "react";
import * as maplibregl from "maplibre-gl";

import { BASEMAP_STYLE } from "./mapStyle.js";

/**
 * Create a MapLibre map and say when it is safe to add layers to it.
 *
 * The birth of a map was written twice, identically, down to the two-step
 * readiness dance: `load` fires before the style is necessarily complete, so
 * what actually guarantees the layers can be added is `idle`. Get that wrong
 * and the map is silently bare.
 *
 * What differs between the two maps — controls, their corners, scroll zoom,
 * an opening animation, event wiring — stays with each of them:
 *
 *   `onCreate(map)` runs once the map exists; whatever it returns is called
 *   on teardown, before the map is destroyed.
 *   `onLoad(map)` runs when the basemap has loaded.
 *   `deps` is the effect's dependency list: `[]` for a map built once,
 *   `[compact]` for one that is rebuilt when its shape changes.
 *
 * Returns `ready` (the gate every layer effect waits on) and the style tick
 * that `retryWhenStyleReady` below drives.
 */
export function useMapInstance({ containerRef, mapRef, view, onCreate, onLoad, deps = [] }) {
  const [ready, setReady] = useState(false);
  const [styleTick, setStyleTick] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      attributionControl: false,
      ...view,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (map.isStyleLoaded()) setReady(true);
      else map.once("idle", () => setReady(true));
      onLoad?.(map);
    });

    // A lost WebGL context takes the layers with it: not ready again until the
    // map has settled.
    map.on("webglcontextlost", () => setReady(false));
    map.on("webglcontextrestored", () => map.once("idle", () => setReady(true)));

    const teardown = onCreate?.(map);

    return () => {
      teardown?.();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ready, styleTick, setStyleTick };
}

/**
 * Call an effect again once the map's style is ready.
 *
 * An effect that builds layers has to wait for the style, and the obvious
 * `if (!map.isStyleLoaded()) return;` is not waiting — it is GIVING UP: none
 * of the effect's dependencies change afterwards, so it never runs again, and
 * the map stays bare. That is what emptied the project map when the tab was
 * left and come back to with the data already cached.
 *
 * Returns a cleanup function, so it is used as a direct `return` from an
 * effect:
 *
 *     if (!map.isStyleLoaded()) return retryWhenStyleReady(map, setStyleTick);
 *
 * The caller keeps a counter in state and lists it among the effect's
 * dependencies. Effects rebuilt this way must be idempotent — rebuilding what
 * is already on the map leaves `isStyleLoaded()` false again and the retry
 * turns into a loop.
 */
export function retryWhenStyleReady(map, bumpStyleTick) {
  const retry = () => bumpStyleTick(tick => tick + 1);
  map.once("idle", retry);
  return () => map.off("idle", retry);
}

/**
 * A hover tooltip that gets out of the way when the map moves.
 *
 * A popup stays pinned to its coordinate, so through a zoom it slides out from
 * under the cursor that summoned it. It is removed as soon as the map starts
 * moving; the next mouse move brings it back.
 *
 * Returns the popup and a dispose function for the effect's cleanup.
 */
export function createHoverPopup(map, options = {}) {
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: "arbm-popup arbm-popup-hover",
    ...options,
  });

  const hide = () => popup.remove();
  map.on("movestart", hide);

  return {
    popup,
    dispose() {
      map.off("movestart", hide);
      popup.remove();
    },
  };
}
