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

    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrapper.setAttribute('x', String(x));
    wrapper.setAttribute('y', String(y));
    wrapper.setAttribute('width', String(width));
    wrapper.setAttribute('height', String(height));
    const viewBox = svgRoot.getAttribute('viewBox') || `0 0 ${width} ${height}`;
    wrapper.setAttribute('viewBox', viewBox);
    wrapper.setAttribute('overflow', 'visible');

    // Move the original SVG's children into the wrapper, preserving the
    // original markup (defs, styles, nested groups, etc.) rather than
    // re-serializing/re-parsing it.
    while (svgRoot.firstChild) {
      wrapper.appendChild(svgRoot.firstChild);
    }

    this.world.appendChild(wrapper);

    const shape = {
      id: nextId++,
      name: file.name,
      x,
      y,
      width,
      height,
      sourceSvgText: text,
      element: wrapper,
    };
    this.shapes.push(shape);
    return shape;
  }
}
