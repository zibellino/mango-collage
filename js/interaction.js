import { snapPoint } from './snapping.js';

// All pointer gestures on the canvas go through here, rather than being
// split across separate listeners, because deciding "is this a pan, a tap,
// or a shape-drag" needs to see the whole gesture as it develops (a plain
// pointerdown doesn't yet tell you whether the finger is about to move).
//
// Interaction model:
// - Single-finger drag starting on empty canvas, or on a shape that is NOT
//   currently selected: pans the camera (and deselects, if something was
//   selected).
// - Single-finger drag starting on the currently SELECTED shape: moves
//   that shape.
// - A single-finger press+release with no real movement (a tap) selects
//   the shape under it, or toggles it off if it was already selected, or
//   deselects if it landed on empty canvas.
// - A single-finger press held in place (no movement past the threshold)
//   on a shape for LONG_PRESS_MS: selects that shape and fires onLongPress
//   (used to show the Remove/Replace popup). This consumes the gesture —
//   the eventual release does NOT also toggle selection like a tap would.
// - Two-finger gesture: always pans/zooms the camera, regardless of what's
//   underneath — this guarantees you can always get the camera moving even
//   if a shape currently covers the whole viewport.

const TAP_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 500;

export function initInteraction(svgEl, camera, doc, { onLongPress } = {}) {
  const pointers = new Map(); // pointerId -> {x, y}
  let single = null; // gesture state while exactly one pointer is down
  let pinch = null; // gesture state while two+ pointers are down
  let selectedId = null;

  function shapeIdFromTarget(target) {
    const el = target.closest && target.closest('[data-shape-id]');
    return el ? Number(el.getAttribute('data-shape-id')) : null;
  }

  function setSelected(id) {
    if (selectedId === id) return;
    if (selectedId != null) {
      const prev = doc.getById(selectedId);
      if (prev) prev.element.classList.remove('selected');
    }
    selectedId = id;
    if (selectedId != null) {
      const next = doc.getById(selectedId);
      if (next) next.element.classList.add('selected');
    }
  }

  function clearLongPressTimer(gesture) {
    if (gesture && gesture.longPressTimer != null) {
      clearTimeout(gesture.longPressTimer);
      gesture.longPressTimer = null;
    }
  }

  function startSingle(pointerId, clientX, clientY) {
    const shapeId = shapeIdFromTarget(document.elementFromPoint(clientX, clientY) || svgEl);
    const shape = shapeId != null ? doc.getById(shapeId) : null;
    const gesture = {
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
      committed: null, // becomes 'pan', 'drag', or 'longpress' once decided
      shapeId,
      shapeStartX: shape ? shape.x : 0,
      shapeStartY: shape ? shape.y : 0,
      // Only a drag that starts on the already-selected shape moves it;
      // starting on any other shape (or empty canvas) always pans.
      canDrag: shapeId != null && shapeId === selectedId,
      longPressTimer: null,
    };

    if (shapeId != null && onLongPress) {
      gesture.longPressTimer = setTimeout(() => {
        if (single !== gesture || gesture.committed) return;
        gesture.committed = 'longpress';
        setSelected(shapeId);
        const s = doc.getById(shapeId);
        if (s) onLongPress(s, clientX, clientY);
      }, LONG_PRESS_MS);
    }

    single = gesture;
  }

  svgEl.addEventListener('pointerdown', (e) => {
    svgEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      pinch = null;
      startSingle(e.pointerId, e.clientX, e.clientY);
    } else if (pointers.size === 2) {
      // A second finger always hands control to the camera. If a shape
      // drag (or a pending long-press) was mid-gesture with the first
      // finger, it simply stops where it is — no special cleanup needed
      // since position updates were already applied live.
      clearLongPressTimer(single);
      single = null;
      const pts = Array.from(pointers.values());
      pinch = {
        lastCentroid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        lastDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      };
    }
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const centroid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

      const panX = centroid.x - pinch.lastCentroid.x;
      const panY = centroid.y - pinch.lastCentroid.y;
      camera.panBy(panX, panY);
      camera.zoomAtClientPoint(centroid, dist / pinch.lastDist);

      pinch.lastCentroid = centroid;
      pinch.lastDist = dist;
      return;
    }

    if (!single || e.pointerId !== single.pointerId) return;
    if (single.committed === 'longpress') return;

    const totalDx = e.clientX - single.startClientX;
    const totalDy = e.clientY - single.startClientY;

    if (!single.committed) {
      if (Math.hypot(totalDx, totalDy) < TAP_THRESHOLD_PX) {
        single.lastClientX = e.clientX;
        single.lastClientY = e.clientY;
        return;
      }
      // Real movement happened — this is a drag/pan, not a long press.
      clearLongPressTimer(single);
      single.committed = single.canDrag ? 'drag' : 'pan';
      if (single.committed === 'pan') setSelected(null);
    }

    if (single.committed === 'drag') {
      const scale = camera.camera.scale;
      const raw = {
        x: single.shapeStartX + totalDx / scale,
        y: single.shapeStartY + totalDy / scale,
      };
      const snapped = snapPoint(raw.x, raw.y);
      doc.setPosition(single.shapeId, snapped.x, snapped.y);
    } else {
      camera.panBy(e.clientX - single.lastClientX, e.clientY - single.lastClientY);
    }
    single.lastClientX = e.clientX;
    single.lastClientY = e.clientY;
  });

  function release(e) {
    pointers.delete(e.pointerId);

    if (single && e.pointerId === single.pointerId) {
      clearLongPressTimer(single);
      if (!single.committed) {
        // No real movement happened: this was a tap.
        if (single.shapeId != null) {
          setSelected(single.shapeId === selectedId ? null : single.shapeId);
        } else {
          setSelected(null);
        }
      }
      // If committed === 'longpress', the popup is already showing — the
      // release itself does nothing further.
      single = null;
    }

    pinch = null;
    if (pointers.size === 1) {
      // One finger remains after a multi-touch gesture ends: start a fresh
      // single-pointer gesture from here (pan-only — we deliberately don't
      // try to recover which shape it might be over, so lifting a finger
      // out of a pinch never accidentally starts dragging a shape, and
      // never accidentally arms a long-press either).
      const [[pointerId, p]] = pointers.entries();
      single = {
        pointerId,
        startClientX: p.x,
        startClientY: p.y,
        lastClientX: p.x,
        lastClientY: p.y,
        committed: null,
        shapeId: null,
        canDrag: false,
        longPressTimer: null,
      };
    }
  }
  svgEl.addEventListener('pointerup', release);
  svgEl.addEventListener('pointercancel', release);

  // Long-press is our own gesture, not the browser's — suppress the native
  // context menu (e.g. Android's "open image"/text-selection popup) so it
  // doesn't fight with ours.
  svgEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Exposed so app.js can clear the selection after an external change to
  // the document (e.g. "New" wiping everything) — selectedId would
  // otherwise keep pointing at a shape that no longer exists.
  return {
    clearSelection: () => setSelected(null),
  };
}
