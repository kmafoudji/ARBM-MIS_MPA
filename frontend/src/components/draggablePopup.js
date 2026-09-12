/**
 * Let a MapLibre popup be dragged, and never let it leave the map.
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
 * WHY IT IS ALSO CLAMPED. Dragging alone is a trap: the popup keeps following
 * its feature, so zooming out can carry the whole card off the canvas, handle
 * and close button with it, and there is then no way to get it back. After
 * every map move the card is pulled back inside the frame, so its handle is
 * always in reach. That also fixes the case that started this: a popup near an
 * edge is now nudged into view even if nobody drags it.
 *
 * The handle is a selector rather than the whole box, so that text in the body
 * stays selectable: a record sheet exists to be read and copied from.
 *
 * The offset resets whenever the popup opens again: a new feature is a new
 * card, and it should appear where it is anchored.
 */

// Breathing room kept between the card and the edge of the map.
const MARGIN = 8;

export function makeDraggable(popup, handleSelector, map) {
  let content = null;
  let handle = null;
  let dx = 0;
  let dy = 0;
  let startX = 0;
  let startY = 0;
  let frameRequest = null;

  function draw() {
    if (content) content.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  }

  /**
   * Pull the card back inside the map. Horizontally the whole card is kept in;
   * vertically only the handle, since a long record is taller than the map and
   * what must stay reachable is the part you grab and close.
   */
  function clamp() {
    if (!content || !handle || !map) return;
    const frame = map.getContainer().getBoundingClientRect();
    const box = content.getBoundingClientRect();
    if (!box.width || !frame.width) return;   // not laid out yet

    let shiftX = 0;
    if (box.width <= frame.width - MARGIN * 2) {
      if (box.left < frame.left + MARGIN) shiftX = frame.left + MARGIN - box.left;
      else if (box.right > frame.right - MARGIN) shiftX = frame.right - MARGIN - box.right;
    } else if (box.left > frame.left + MARGIN) {
      // Wider than the map: keep its left edge against the left margin.
      shiftX = frame.left + MARGIN - box.left;
    }

    const grip = handle.getBoundingClientRect();
    let shiftY = 0;
    if (grip.top < frame.top + MARGIN) shiftY = frame.top + MARGIN - grip.top;
    else if (grip.bottom > frame.bottom - MARGIN) shiftY = frame.bottom - MARGIN - grip.bottom;

    if (shiftX || shiftY) {
      dx += shiftX;
      dy += shiftY;
      draw();
    }
  }

  // The map fires `move` continuously through a zoom; one clamp per frame is
  // enough and keeps the card from stuttering against the edge.
  function scheduleClamp() {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = null;
      clamp();
    });
  }

  function onPointerDown(event) {
    // The close button lives in the card's top corner; let it do its job.
    if (event.button !== 0 || event.target.closest(".maplibregl-popup-close-button")) return;
    startX = event.clientX - dx;
    startY = event.clientY - dy;
    handle.setPointerCapture?.(event.pointerId);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
    // Without this the map pans underneath the card as it is dragged.
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    dx = event.clientX - startX;
    dy = event.clientY - startY;
    draw();
    clamp();
  }

  function onPointerUp(event) {
    handle.releasePointerCapture?.(event.pointerId);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerUp);
  }

  function detach() {
    handle?.removeEventListener("pointerdown", onPointerDown);
    map?.off("move", scheduleClamp);
    map?.off("resize", scheduleClamp);
    if (frameRequest) {
      cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }
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
    map?.on("move", scheduleClamp);
    map?.on("resize", scheduleClamp);
    draw();
    clamp();
  });

  popup.on("close", detach);

  return detach;
}
