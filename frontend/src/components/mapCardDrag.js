/**
 * Dragging a `.map-card` by its header, for both maps.
 *
 * This lives in one place because the two copies had already drifted: the
 * portfolio card let its close button through, the project sheet did not, and
 * its × stopped working — `preventDefault()` on the header's pointerdown
 * cancels the click the button was waiting for. A rule that has to hold in two
 * components eventually holds in one of them.
 */

/**
 * Start a drag from a header pointerdown.
 *
 * `origin` is the card's current {x, y}; `onMove` receives the new {x, y} as
 * the pointer travels. Anything that is not a plain left-button press on the
 * header itself is left alone — the close button above all.
 */
export function startCardDrag(event, origin, onMove) {
  if (event.button !== 0) return;
  // The close button sits inside the header: it keeps its click.
  if (event.target.closest(".map-card-close")) return;

  const startX = event.clientX - (origin?.x ?? 0);
  const startY = event.clientY - (origin?.y ?? 0);
  const node = event.currentTarget;

  const move = (e) => onMove({ x: e.clientX - startX, y: e.clientY - startY });
  const stop = (e) => {
    node.releasePointerCapture?.(e.pointerId);
    node.removeEventListener("pointermove", move);
    node.removeEventListener("pointerup", stop);
    node.removeEventListener("pointercancel", stop);
  };

  node.setPointerCapture?.(event.pointerId);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", stop);
  node.addEventListener("pointercancel", stop);
  // Without this the map pans underneath the card as it is dragged.
  event.preventDefault();
}
