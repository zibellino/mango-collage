import { buildCleanWrapper, parseMultiShapeSvg } from './shapes.js';
import { unzipSync, strFromU8 } from './vendor/fflate.js';

function computeBoundingBox(shapes) {
  if (shapes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to actually start the download before
  // revoking the blob URL it points to.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Combines every shape (rebuilt fresh from its own stored SVG source, not
// cloned from the live/editor DOM — the live wrapper has editor-only bits,
// e.g. the invisible hit-rect and selection class, that must never leak
// into an export) into one standalone SVG file.
export function exportCombinedSvg(doc) {
  if (doc.shapes.length === 0) {
    alert('Nothing to export yet — add a shape first.');
    return;
  }

  const bbox = computeBoundingBox(doc.shapes);
  const svgNs = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(svgNs, 'svg');
  root.setAttribute('xmlns', svgNs);
  root.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);
  // World units are mm directly (see grid.js) — no conversion needed for
  // the exported file's physical size.
  root.setAttribute('width', `${bbox.width}mm`);
  root.setAttribute('height', `${bbox.height}mm`);

  for (const shape of doc.shapes) {
    const { wrapper } = buildCleanWrapper(shape.sourceSvgText, shape.x - bbox.minX, shape.y - bbox.minY);
    // Marks this wrapper as one of ours (as opposed to an arbitrary nested
    // <svg> some other tool produced), and preserves the original name —
    // both read back by parseMultiShapeSvg() so opening this same file
    // later reconstructs separate, individually-editable shapes instead of
    // one flattened blob.
    wrapper.setAttribute('data-name', shape.name);
    root.appendChild(wrapper);
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  triggerDownload(blob, `mango-collage-${Date.now()}.svg`);
}

// Like exportCombinedSvg, but flattened: each shape's content is moved
// directly under the root <svg> (wrapped only in a plain <g> transform),
// rather than staying nested inside its own <svg x y width height
// viewBox> element. The translate/scale/translate transform reproduces
// exactly what that nested <svg>'s x/y/width/height/viewBox would have
// done to its content, so the visual result is identical — just without
// any nested <svg> shapes in the output. Because the per-shape wrapper is
// gone, this is a one-way export: unlike exportCombinedSvg's output, a
// flattened file can't be read back by parseMultiShapeSvg into separate,
// individually-editable shapes.
export function exportFlattenedSvg(doc) {
  if (doc.shapes.length === 0) {
    alert('Nothing to export yet — add a shape first.');
    return;
  }

  const bbox = computeBoundingBox(doc.shapes);
  const svgNs = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(svgNs, 'svg');
  root.setAttribute('xmlns', svgNs);
  root.setAttribute('viewBox', `0 0 ${bbox.width} ${bbox.height}`);
  root.setAttribute('width', `${bbox.width}mm`);
  root.setAttribute('height', `${bbox.height}mm`);

  for (const shape of doc.shapes) {
    const { wrapper, width, height, viewBox } = buildCleanWrapper(shape.sourceSvgText, 0, 0);
    const [vx, vy, vw, vh] = viewBox.trim().split(/[\s,]+/).map(Number);

    // Root-space placement, same as the nested wrapper's x/y would give.
    const tx = shape.x - bbox.minX;
    const ty = shape.y - bbox.minY;
    // viewBox -> width/height scale, same as the nested wrapper applied
    // implicitly via its own viewBox attribute.
    const sx = vw ? width / vw : 1;
    const sy = vh ? height / vh : 1;

    const g = document.createElementNS(svgNs, 'g');
    g.setAttribute('data-name', shape.name);
    g.setAttribute(
      'transform',
      `translate(${tx}, ${ty}) scale(${sx}, ${sy}) translate(${-vx || 0}, ${-vy || 0})`
    );

    while (wrapper.firstChild) {
      g.appendChild(wrapper.firstChild);
    }
    root.appendChild(g);
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  triggerDownload(blob, `mango-collage-flat-${Date.now()}.svg`);
}

// "Open" always replaces the current canvas (unlike "Add", which inserts
// into it) — a single .svg opens as if it were a one-shape project, a .zip
// restores a full previously-exported project including camera position.
export async function openFile(file, { doc, camera, interaction, autosave }) {
  const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
  const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';

  if (!isZip && !isSvg) {
    alert('Please choose an SVG or a ZIP file exported from this app.');
    return;
  }

  if (doc.shapes.length > 0) {
    if (!confirm('Open this file? This clears the current collage and can\u2019t be undone.')) return;
  }

  if (isSvg) {
    const text = await file.text();
    const multi = parseMultiShapeSvg(text);

    if (multi) {
      doc.clear();
      interaction.clearSelection();
      // A previously exported multi-shape SVG carries each shape's
      // absolute position already — placed exactly as saved, same as a
      // ZIP restore, not recentered like a fresh single-shape Add.
      multi.forEach((m, i) => {
        doc.restoreShape({ id: i + 1, name: m.name, sourceSvgText: m.sourceSvgText, x: m.x, y: m.y });
      });
    } else {
      let width, height;
      try {
        ({ width, height } = buildCleanWrapper(text, 0, 0));
      } catch {
        alert(`"${file.name}" doesn't look like a valid SVG file.`);
        return;
      }
      doc.clear();
      interaction.clearSelection();
      const center = camera.getViewportCenterWorld();
      doc.restoreShape({
        id: 1,
        name: file.name,
        sourceSvgText: text,
        x: center.x - width / 2,
        y: center.y - height / 2,
      });
    }
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let entries;
    try {
      entries = unzipSync(bytes);
    } catch (err) {
      alert(`"${file.name}" doesn't look like a valid ZIP file.`);
      return;
    }

    const manifestBytes = entries['manifest.json'];
    if (!manifestBytes) {
      alert(`"${file.name}" doesn't contain a manifest.json — it doesn't look like a Mango Collage export.`);
      return;
    }

    let manifest;
    try {
      manifest = JSON.parse(strFromU8(manifestBytes));
    } catch {
      alert(`"${file.name}"'s manifest.json is corrupted.`);
      return;
    }

    doc.clear();
    interaction.clearSelection();

    for (const entry of manifest.shapes || []) {
      const svgBytes = entries[entry.file];
      if (!svgBytes) {
        console.warn(`Missing file referenced in manifest: ${entry.file}`);
        continue;
      }
      doc.restoreShape({
        id: entry.id,
        name: entry.name,
        sourceSvgText: strFromU8(svgBytes),
        x: entry.x,
        y: entry.y,
      });
    }

    if (manifest.camera) {
      camera.setState(manifest.camera);
    }
  }

  await autosave.saveNow();
}
