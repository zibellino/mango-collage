// World units are millimeters directly (1 world unit = 1mm), matching the
// visual grid and snap grid — see grid.js/snapping.js. SVG shapes are never
// scaled: their own width/height (or viewBox, as a fallback) defines their
// size in that same unit, so a shape's on-screen size only changes with the
// camera zoom, exactly like the grid.

let nextId = 1;

function parseLength(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  // Accept plain numbers or explicit px — anything else (mm, in, %, etc.)
  // is intentionally not handled yet, since imported shapes are expected
  // to use unitless/px dimensions for now.
  const match = trimmed.match(/^([0-9.]+)(px)?$/);
  if (!match) return null;
  return parseFloat(match[1]);
}

function getIntrinsicSize(svgRoot) {
  const widthAttr = parseLength(svgRoot.getAttribute('width'));
  const heightAttr = parseLength(svgRoot.getAttribute('height'));
  if (widthAttr && heightAttr) {
    return { width: widthAttr, height: heightAttr };
  }

  const viewBox = svgRoot.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  // Last-resort fallback so a malformed/unitless SVG still places visibly.
  return { width: 100, height: 100 };
}

// Builds a plain, namespaced <svg x y width height viewBox> wrapper around
// the original SVG's content, with none of the editor-only extras (hit
// rect, selection class, data-shape-id). Shared by _addShape (which then
// layers those extras on top) and by export (which wants exactly this,
// nothing more).
export function buildCleanWrapper(sourceSvgText, x, y) {
  const parsed = new DOMParser().parseFromString(sourceSvgText, 'image/svg+xml');
  const svgRoot = parsed.documentElement;

  if (svgRoot.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    throw new Error("Doesn't look like a valid SVG file.");
  }

  const { width, height } = getIntrinsicSize(svgRoot);
  const viewBox = svgRoot.getAttribute('viewBox') || `0 0 ${width} ${height}`;

  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wrapper.setAttribute('x', String(x));
  wrapper.setAttribute('y', String(y));
  wrapper.setAttribute('width', String(width));
  wrapper.setAttribute('height', String(height));
  wrapper.setAttribute('viewBox', viewBox);
  wrapper.setAttribute('overflow', 'visible');

  while (svgRoot.firstChild) {
    wrapper.appendChild(svgRoot.firstChild);
  }

  return { wrapper, width, height, viewBox };
}

// Detects whether `text` is a combined multi-shape SVG previously produced
// by exportCombinedSvg (a root <svg> containing child <svg data-name ...>
// wrappers) and, if so, returns each child as a standalone shape spec so
// the caller can re-import them as separate shapes rather than one flat
// blob. Returns null if the file doesn't match that pattern (an ordinary,
// non-Mango-Collage SVG), so callers fall back to treating it as one shape
// — this avoids misinterpreting an arbitrary third-party SVG that happens
// to contain nested <svg> elements for unrelated reasons.
export function parseMultiShapeSvg(text) {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    return null;
  }

  const children = Array.from(root.children).filter(
    (el) => el.nodeName.toLowerCase() === 'svg' && el.hasAttribute('data-name')
  );
  if (children.length === 0) return null;

  const serializer = new XMLSerializer();
  return children.map((el) => ({
    name: el.getAttribute('data-name'),
    x: parseFloat(el.getAttribute('x')) || 0,
    y: parseFloat(el.getAttribute('y')) || 0,
    sourceSvgText: serializer.serializeToString(el),
  }));
}

export class ShapeDocument {
  constructor(worldEl) {
    this.world = worldEl;
    this.shapes = [];
    // Called after any mutation (add or move). Assigned by app.js to
    // trigger autosave; a no-op by default so ShapeDocument doesn't need
    // to know persistence exists.
    this.onChange = () => {};
  }

  // Returns a single new shape normally. If the file is a previously
  // exported multi-shape SVG (see parseMultiShapeSvg), returns an array of
  // shapes instead, offset as a group so their combined layout lands
  // centered on the current viewport (their relative positions to each
  // other are preserved).
  async addFromFile(file, camera) {
    const text = await file.text();
    const multi = parseMultiShapeSvg(text);

    if (multi) {
      const built = multi.map((m) => ({ ...m, ...buildCleanWrapper(m.sourceSvgText, 0, 0) }));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of built) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
      const center = camera.getViewportCenterWorld();
      const offsetX = center.x - (maxX - minX) / 2 - minX;
      const offsetY = center.y - (maxY - minY) / 2 - minY;

      return built.map((b) =>
        this._addShape({
          id: nextId++,
          name: b.name,
          sourceSvgText: b.sourceSvgText,
          x: b.x + offsetX,
          y: b.y + offsetY,
        })
      );
    }

    let width, height;
    try {
      ({ width, height } = buildCleanWrapper(text, 0, 0));
    } catch {
      throw new Error(`"${file.name}" doesn't look like a valid SVG file.`);
    }

    const center = camera.getViewportCenterWorld();
    const x = center.x - width / 2;
    const y = center.y - height / 2;

    return this._addShape({ id: nextId++, name: file.name, sourceSvgText: text, x, y });
  }

  // Recreates a shape from previously-saved data (autosave restore, or
  // opening an exported project). Unlike addFromFile, the id/position are
  // given rather than computed, since we're putting things back exactly
  // where they were.
  restoreShape(saved) {
    const shape = this._addShape({
      id: saved.id,
      name: saved.name,
      sourceSvgText: saved.sourceSvgText,
      x: saved.x,
      y: saved.y,
    });
    // Keep the id counter ahead of anything restored, so newly-added
    // shapes after a restore never collide with a restored id.
    nextId = Math.max(nextId, saved.id + 1);
    return shape;
  }

  // Builds the full editor-ready wrapper (source content + hit-rect +
  // selection/id bookkeeping attributes) but doesn't attach it to the DOM
  // or the shapes array — shared by _addShape (which does both) and
  // replaceShapeFromFile (which swaps it into an existing shape's slot
  // instead).
  _buildEditorWrapper(id, sourceSvgText, x, y) {
    const { wrapper, width, height, viewBox } = buildCleanWrapper(sourceSvgText, x, y);
    const viewBoxParts = viewBox.trim().split(/[\s,]+/).map(Number);

    wrapper.setAttribute('data-shape-id', String(id));
    wrapper.classList.add('shape-wrapper');

    // An invisible rect covering the shape's full bounding box (in its own
    // viewBox coordinate space), so the whole shape is tappable/draggable —
    // not just wherever it happens to have visible/painted pixels.
    // pointer-events: all makes it hit-testable despite fill: none. It also
    // doubles as the selection outline (styled via the .hit-rect class).
    const hitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hitRect.setAttribute('x', String(viewBoxParts[0] ?? 0));
    hitRect.setAttribute('y', String(viewBoxParts[1] ?? 0));
    hitRect.setAttribute('width', String(viewBoxParts[2] ?? width));
    hitRect.setAttribute('height', String(viewBoxParts[3] ?? height));
    hitRect.setAttribute('fill', 'none');
    hitRect.setAttribute('pointer-events', 'all');
    // Constant on-screen stroke width regardless of camera zoom, once
    // selected — otherwise the dashed outline would get thinner/thicker as
    // you zoom, same idea as the grid staying legible at any zoom level.
    hitRect.setAttribute('vector-effect', 'non-scaling-stroke');
    hitRect.classList.add('hit-rect');
    wrapper.appendChild(hitRect);

    return { wrapper, width, height };
  }

  _addShape({ id, name, sourceSvgText, x, y }) {
    const { wrapper, width, height } = this._buildEditorWrapper(id, sourceSvgText, x, y);
    this.world.appendChild(wrapper);

    const shape = { id, name, x, y, width, height, sourceSvgText, element: wrapper };
    this.shapes.push(shape);
    this.onChange();
    return shape;
  }

  getById(id) {
    return this.shapes.find((s) => s.id === id);
  }

  // Updates both the model and the DOM element's position. Used while
  // dragging.
  setPosition(id, x, y) {
    const shape = this.getById(id);
    if (!shape) return;
    shape.x = x;
    shape.y = y;
    shape.element.setAttribute('x', String(x));
    shape.element.setAttribute('y', String(y));
    this.onChange();
  }

  // Removes a single shape from both the DOM and the model. Used by the
  // long-press "Remove" action.
  removeShape(id) {
    const index = this.shapes.findIndex((s) => s.id === id);
    if (index === -1) return;
    this.shapes[index].element.remove();
    this.shapes.splice(index, 1);
    this.onChange();
  }

  // Swaps a shape's content for a new file's, in place — same id and
  // position, and the new element takes the old one's exact spot in the
  // DOM (world.replaceChild), so stacking order is preserved rather than
  // jumping to the front like a fresh Add would. Used by the long-press
  // "Replace" action.
  async replaceShapeFromFile(id, file) {
    const index = this.shapes.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('That shape no longer exists.');
    const existing = this.shapes[index];

    const text = await file.text();
    let built;
    try {
      built = this._buildEditorWrapper(id, text, existing.x, existing.y);
    } catch {
      throw new Error(`"${file.name}" doesn't look like a valid SVG file.`);
    }

    this.world.replaceChild(built.wrapper, existing.element);
    const shape = {
      id,
      name: file.name,
      x: existing.x,
      y: existing.y,
      width: built.width,
      height: built.height,
      sourceSvgText: text,
      element: built.wrapper,
    };
    this.shapes[index] = shape;
    this.onChange();
    return shape;
  }

  // Plain-data snapshot suitable for persistence/export (no DOM elements).
  serialize() {
    return this.shapes.map(({ id, name, x, y, width, height, sourceSvgText }) => ({
      id, name, x, y, width, height, sourceSvgText,
    }));
  }

  // Removes every shape from both the DOM and the model. Used by "New".
  clear() {
    for (const shape of this.shapes) {
      shape.element.remove();
    }
    this.shapes = [];
    this.onChange();
  }
}
