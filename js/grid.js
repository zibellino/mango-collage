const GRID_SPACING_MM = 5;

const MIN_SCALE = 0.2;
const MAX_SCALE = 40;

// GridCamera owns the camera state (pan/zoom) and the grid rendering. It
// does NOT bind any pointer events itself — gesture handling lives in
// interaction.js, which decides whether a given gesture should move the
// camera or a shape, and calls panBy()/zoomAtClientPoint() accordingly.
export class GridCamera {
  constructor(svgEl) {
    this.svg = svgEl;
    this.world = svgEl.querySelector('#world');
    this.gridPattern = svgEl.querySelector('#grid-pattern');
    this.gridLinePath = svgEl.querySelector('.grid-line');

    // camera.x/y: screen-pixel translation applied before scaling.
    // camera.scale: current zoom factor (1 world unit = 1mm; at scale 1,
    // 1mm of world space renders as 1 CSS px on screen).
    this.camera = { x: 0, y: 0, scale: 1 };

    this.gridEnabled = true;
    this.gridSpacingMm = GRID_SPACING_MM;

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

  // Returns the world-space point currently at the center of the visible
  // viewport. World space is millimeters directly (1 world unit = 1mm).
  getViewportCenterWorld() {
    const rect = this.svg.getBoundingClientRect();
    const screenCenterX = rect.width / 2;
    const screenCenterY = rect.height / 2;
    return {
      x: (screenCenterX - this.camera.x) / this.camera.scale,
      y: (screenCenterY - this.camera.y) / this.camera.scale,
    };
  }

  // Pans by a screen-pixel delta (not world-space — the caller is
  // typically forwarding raw pointer movement).
  panBy(dxScreen, dyScreen) {
    this.camera.x += dxScreen;
    this.camera.y += dyScreen;
    this._render();
  }

  // Zooms by `factor` (e.g. 1.02 for a slight zoom-in), keeping the given
  // client-space point fixed on screen — the standard anchored-zoom
  // approach for pinch gestures.
  zoomAtClientPoint(centroidClient, factor) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.camera.scale * factor));
    const appliedFactor = newScale / this.camera.scale;
    this.camera.x = (this.camera.x - centroidClient.x) * appliedFactor + centroidClient.x;
    this.camera.y = (this.camera.y - centroidClient.y) * appliedFactor + centroidClient.y;
    this.camera.scale = newScale;
    this._render();
  }

  // Directly sets the camera state (used to restore a saved session) and
  // re-renders. Unlike panBy/zoomAtClientPoint, this isn't a relative
  // gesture update.
  setState({ x, y, scale }) {
    this.camera.x = x;
    this.camera.y = y;
    this.camera.scale = scale;
    this._render();
  }

  _render() {
    const { x, y, scale } = this.camera;
    this.world.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);

    const spacingPx = this.gridSpacingMm * scale;

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
