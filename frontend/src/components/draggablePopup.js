/**
 * Pin a MapLibre popup where it opens, and let the user drag it by a handle.
 *
 * A popup anchored near an edge can end up half outside the canvas, or over
 * the very feature it describes. MapLibre has no answer for that: its anchor
 * flips between top and bottom, and nothing more.
 *
 * TWO THINGS HAPPEN HERE, AND THE SECOND IS THE POINT.
 *
 * 1. The card is draggable by a handle.
 * 2. Once open, it STOPS FOLLOWING THE MAP. It appears where its feature is,
 *    and from then on only the hand moves it — pan and zoom leave it where it
 *    sits.
 *
 * The second is what makes the first safe. A card that keeps tracking its
 * feature can be carried off the canvas by a zoom, taking its handle and its
 * close button with it, and nothing brings it back. Freezing it on open means
 * it can never go anywhere the user did not put it, and the only thing that
 * can move it is a pointer — which is on screen by definition.
 *
 * HOW. MapLibre owns the transform of the popup container
 * (`.maplibregl-popup`) and rewrites it on every map move, so nothing applied
 * there survives. Both effects are therefore done on the CONTENT element
 * inside it, which MapLibre never touches: its translate is the drag the user
 * asked for, plus however far MapLibre has since moved the container —
 * cancelling that movement out exactly.
 *
 * The handle is a selector rather than the whole box, so that text in the body
 * stays selectable: a record sheet exists to be read and copied from.
 *
 * The offset resets whenever the popup opens again: a new feature is a new
 * card, and it should appear where it is anchored.
 */
export function makeDraggable(popup, handleSelector, map) {
  let content = null;
  let handle = null;
  // Where MapLibre had put the container when the card opened. Everything is
  // measured against this.
  let origin = null;
  let dragX = 0;
  let dragY = 0;
  let startX = 0;
  let startY = 0;
  let frameRequest = null;

  /**
   * Where the container sits inside the map, not inside the viewport: measured
   * against the window, scrolling the page would read as the map having moved
   * and the card would peel away from it.
   */
  function positionInMap(element) {
    const frame = map?.getContainer().getBoundingClientRect();
    const box = element?.getBoundingClientRect();
    if (!frame || !box) return null;
    return { left: box.left - frame.left, top: box.top - frame.top };
  }

  function draw() {
    if (!content) return;
    let x = dragX;
    let y = dragY;
    if (origin) {
      // Undo whatever the map has done to the container since the card opened.
      const now = positionInMap(content.parentElement);
      if (now) {
        x += origin.left - now.left;
        y += origin.top - now.top;
      }
    }
    content.style.transform = x || y ? `translate(${x}px, ${y}px)` : "";
  }

  // The map fires `move` continuously through a zoom; one correction per frame
  // is enough and keeps the card from stuttering.
  function scheduleDraw() {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = null;
      draw();
    });
  }

  function onPointerDown(event) {
    // The close button lives in the card's top corner; let it do its job.
    if (event.button !== 0 || event.target.closest(".maplibregl-popup-close-button")) return;
    startX = event.clientX - dragX;
    startY = event.clientY - dragY;
    handle.setPointerCapture?.(event.pointerId);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
    // Without this the map pans underneath the card as it is dragged.
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    dragX = event.clientX - startX;
    dragY = event.clientY - startY;
    draw();
  }

  function onPointerUp(event) {
    handle.releasePointerCapture?.(event.pointerId);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerUp);
  }

  function detach() {
    handle?.removeEventListener("pointerdown", onPointerDown);
    map?.off("move", scheduleDraw);
    if (frameRequest) {
      cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }
    content = null;
    handle = null;
    origin = null;
  }

  popup.on("open", () => {
    detach();
    dragX = 0;
    dragY = 0;
    const element = popup.getElement();
    content = element?.querySelector(".maplibregl-popup-content") || null;
    handle = content?.querySelector(handleSelector) || null;
    if (!handle) return;          // a popup without a handle simply does not drag
    handle.classList.add("arbm-popup-handle");
    handle.addEventListener("pointerdown", onPointerDown);
    // Read the opening position before anything is translated.
    origin = positionInMap(element);
    map?.on("move", scheduleDraw);
  });

  popup.on("close", detach);

  return detach;
}
