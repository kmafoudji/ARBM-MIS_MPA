/**
 * Let a MapLibre popup be dragged out of an awkward corner.
 *
 * A popup anchored near an edge can end up half outside the canvas, or over
 * the very feature it describes. MapLibre has no answer for that: its anchor
 * flips between top and bottom, and nothing more.
 *
 * HOW, AND WHY NOT THE OBVIOUS WAY. MapLibre owns the transform of the popup
 * container (`.maplibregl-popup`) and rewrites it on every map move, so a
 * translate applied there is wiped by the next pan. The drag therefore moves
 * the CONTENT element inside it, which MapLibre never touches. The popup stays
 * anchored to its feature — pan and zoom still carry it along — and simply
 * draws at the offset you left it at.
 *
 * The handle is a selector rather than the whole box, so that text in the body
 * stays selectable: a record sheet exists to be read and copied from.
 *
 * The offset resets whenever the popup opens again: a new feature is a new
 * card, and it should appear where it is anchored.
 */
export function makeDraggable(popup, handleSelector) {
  let content = null;
  let handle = null;
  let dx = 0;
  let dy = 0;
  let startX = 0;
  let startY = 0;

  function draw() {
    if (content) content.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  }

  function onPointerDown(event) {
    // The close button lives inside the handle's corner; let it do its job.
    if (event.button !== 0 || event.target.closest(".maplibregl-popup-close-button")) return;
    startX = event.clientX - dx;
    startY = event.clientY - dy;
    handle.setPointerCapture?.(event.pointerId);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
    // Without this the map pans underneath the popup as it is dragged.
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    dx = event.clientX - startX;
    dy = event.clientY - startY;
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
    content = null;
    handle = null;
  }

  popup.on("open", () => {
    detach();
    dx = 0;
    dy = 0;
    const element = popup.getElement();
    content = element?.querySelector(".maplibregl-popup-content") || null;
    handle = content?.querySelector(handleSelector) || null;
    if (!handle) return;          // a popup without a handle simply does not drag
    handle.classList.add("arbm-popup-handle");
    handle.addEventListener("pointerdown", onPointerDown);
    draw();
  });

  popup.on("close", detach);

  return detach;
}
