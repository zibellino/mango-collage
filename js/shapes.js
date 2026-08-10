// World units are CSS px at camera scale 1 (see grid.js). SVG shapes are
// never scaled: their own width/height (or viewBox, as a fallback) defines
// their size in that same unit, so a shape's on-screen size only changes
// with the camera zoom, exactly like the grid.

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

export class ShapeDocument {
  constructor(worldEl) {
    this.world = worldEl;
    this.shapes = [];
  }

  async addFromFile(file, camera) {
    const text = await file.text();
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svgRoot = parsed.documentElement;

    if (svgRoot.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
      throw new Error(`"${file.name}" doesn't look like a valid SVG file.`);
    }

    const { width, height } = getIntrinsicSize(svgRoot);
    const center = camera.getViewportCenterWorld();
    const x = center.x - width / 2;
    const y = center.y - height / 2;

    const viewBox = svgRoot.getAttribute('viewBox') || `0 0 ${width} ${height}`;
    const viewBoxParts = viewBox.trim().split(/[\s,]+/).map(Number);

    const id = nextId++;

    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrapper.setAttribute('x', String(x));
    wrapper.setAttribute('y', String(y));
    wrapper.setAttribute('width', String(width));
    wrapper.setAttribute('height', String(height));
    wrapper.setAttribute('viewBox', viewBox);
    wrapper.setAttribute('overflow', 'visible');
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

    // Move the original SVG's children into the wrapper, preserving the
    // original markup (defs, styles, nested groups, etc.) rather than
    // re-serializing/re-parsing it.
    while (svgRoot.firstChild) {
      wrapper.appendChild(svgRoot.firstChild);
    }

    this.world.appendChild(wrapper);

    const shape = { id, name: file.name, x, y, width, height, sourceSvgText: text, element: wrapper };
    this.shapes.push(shape);
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
  }
}
