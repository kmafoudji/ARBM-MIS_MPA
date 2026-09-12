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
import * as maplibregl from "maplibre-gl";

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
