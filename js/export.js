import { buildCleanWrapper } from './shapes.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from './vendor/fflate.js';

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
    root.appendChild(wrapper);
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  triggerDownload(blob, `mango-collage-${Date.now()}.svg`);
}

function sanitizeFilename(name) {
  const base = name.replace(/\.svg$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'shape';
  return base;
}

// Zip archive containing the original individual SVG files (untouched, so
// they're independently usable/inspectable outside the app too) plus a
// manifest.json with each shape's position/size and the current camera
// view, sufficient to fully restore the session via openZip().
export function exportZip(doc, camera) {
  if (doc.shapes.length === 0) {
    alert('Nothing to export yet — add a shape first.');
    return;
  }

  const usedNames = new Set();
  const files = {};
  const manifestShapes = [];

  for (const shape of doc.shapes) {
    let filename = `${sanitizeFilename(shape.name)}.svg`;
    let n = 2;
    while (usedNames.has(filename)) {
      filename = `${sanitizeFilename(shape.name)}-${n}.svg`;
      n++;
    }
    usedNames.add(filename);

    files[`shapes/${filename}`] = strToU8(shape.sourceSvgText);
    manifestShapes.push({
      id: shape.id,
      name: shape.name,
      file: `shapes/${filename}`,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    });
  }

  const manifest = {
    version: 1,
    camera: { ...camera.camera },
    shapes: manifestShapes,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  triggerDownload(blob, `mango-collage-${Date.now()}.zip`);
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
