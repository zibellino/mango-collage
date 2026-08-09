// Millimeters are converted to CSS reference pixels using the standard
// browser convention: 96px = 1in, so 1mm = 96/25.4 px. This is an
// approximation (browsers don't know the display's true physical density),
// but it's the same convention every browser uses for CSS length units, so
// it stays consistent across devices and with any CSS "mm" values.
const PX_PER_MM = 96 / 25.4;
const GRID_SPACING_MM = 5;

const MIN_SCALE = 0.2;
const MAX_SCALE = 40;

export class GridCamera {
  constructor(svgEl) {
    this.svg = svgEl;
    this.world = svgEl.querySelector('#world');
    this.gridPattern = svgEl.querySelector('#grid-pattern');
    this.gridLinePath = svgEl.querySelector('.grid-line');

    // camera.x/y: screen-pixel translation applied before scaling.
    // camera.scale: current zoom factor (1 = 1mm in world space renders as
    // PX_PER_MM screen pixels).
    this.camera = { x: 0, y: 0, scale: 1 };

    this.gridEnabled = true;
    this.gridSpacingMm = GRID_SPACING_MM;

    this._pointers = new Map();
    this._lastCentroid = null;
    this._lastDist = null;
    this._lastSingle = null;

    this._bindEvents();
    this._render();
  }

  setGridEnabled(enabled) {
    this.gridEnabled = enabled;
    this._render();
  }

  setGridSpacingMm(mm) {
    this.gridSpacingMm = mm;
    this._render();
  }

  _bindEvents() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._lastCentroid = null;
      this._lastDist = null;
      // Always re-anchor on a fresh pointer touching down, so a new
      // tap/drag never pans against a stale position left over from a
      // previous gesture.
      this._lastSingle = { x: e.clientX, y: e.clientY };
    });

    svg.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pts = Array.from(this._pointers.values());
      if (pts.length === 1) {
        this._panOnly(pts[0]);
      } else if (pts.length >= 2) {
        this._panAndZoom(pts[0], pts[1]);
      }
    });

    const release = (e) => {
      this._pointers.delete(e.pointerId);
      this._lastCentroid = null;
      this._lastDist = null;
      if (this._pointers.size === 1) {
        // Reset the anchor for the remaining single pointer so it doesn't
        // jump on the next move.
        const [p] = this._pointers.values();
        this._lastSingle = { x: p.x, y: p.y };
      } else {
        // No pointers left down: clear the anchor so the next tap/drag
        // starts fresh instead of panning against a stale position.
        this._lastSingle = null;
      }
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
  }

  _panOnly(p) {
    if (!this._lastSingle) {
      this._lastSingle = { x: p.x, y: p.y };
      return;
    }
    const dx = p.x - this._lastSingle.x;
    const dy = p.y - this._lastSingle.y;
    this.camera.x += dx;
    this.camera.y += dy;
    this._lastSingle = { x: p.x, y: p.y };
    this._render();
  }

  _panAndZoom(p1, p2) {
    this._lastSingle = null;
    const centroid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    if (this._lastCentroid && this._lastDist) {
      const zoom = dist / this._lastDist;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.camera.scale * zoom));
      const panX = centroid.x - this._lastCentroid.x;
      const panY = centroid.y - this._lastCentroid.y;

      // Keep the point under the centroid fixed on screen while zooming,
      // then apply the pan on top (same approach as a standard two-finger
      // transform gesture).
      this.camera.x = (this.camera.x - centroid.x) * (newScale / this.camera.scale) + centroid.x + panX;
      this.camera.y = (this.camera.y - centroid.y) * (newScale / this.camera.scale) + centroid.y + panY;
      this.camera.scale = newScale;
      this._render();
    }

    this._lastCentroid = centroid;
    this._lastDist = dist;
  }

  _render() {
    const { x, y, scale } = this.camera;
    this.world.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);

    const spacingPx = this.gridSpacingMm * PX_PER_MM * scale;

    if (!this.gridEnabled || spacingPx <= 0) {
      this.gridPattern.setAttribute('width', '0');
      this.gridPattern.setAttribute('height', '0');
      document.getElementById('grid-bg').style.visibility = 'hidden';
      return;
    }
    document.getElementById('grid-bg').style.visibility = 'visible';

    this.gridPattern.setAttribute('width', String(spacingPx));
    this.gridPattern.setAttribute('height', String(spacingPx));
    this.gridPattern.setAttribute('patternTransform', `translate(${x} ${y})`);
    this.gridLinePath.setAttribute('d', `M ${spacingPx} 0 L 0 0 0 ${spacingPx}`);
  }
}
