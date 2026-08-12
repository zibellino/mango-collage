import { GridCamera } from './grid.js';
import { initMenu } from './menu.js';
import { ShapeDocument } from './shapes.js';
import { initInteraction } from './interaction.js';
import { Autosave } from './persistence.js';
import { exportCombinedSvg, exportZip, openFile } from './export.js';
import { showShapeContextMenu } from './context-menu.js';

const svg = document.getElementById('canvas');
const camera = new GridCamera(svg);
const doc = new ShapeDocument(svg.querySelector('#world'));
const replaceInput = document.getElementById('replace-input');

const interaction = initInteraction(svg, camera, doc, {
  onLongPress: (shape, clientX, clientY) => {
    showShapeContextMenu(clientX, clientY, {
      onRemove: () => {
        doc.removeShape(shape.id);
        interaction.clearSelection();
      },
      onReplace: () => {
        replaceInput.dataset.targetId = String(shape.id);
        replaceInput.value = '';
        replaceInput.click();
      },
    });
  },
});

replaceInput.addEventListener('change', async () => {
  const file = replaceInput.files && replaceInput.files[0];
  const targetId = Number(replaceInput.dataset.targetId);
  if (!file || !targetId) return;
  try {
    await doc.replaceShapeFromFile(targetId, file);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not replace that shape.');
  }
  interaction.clearSelection();
});

const autosave = new Autosave(doc, camera);
doc.onChange = () => autosave.scheduleSave();
autosave.load().catch((err) => console.warn('Failed to restore saved session', err));

// A pending debounced save can be lost if the tab/app is killed in the
// background before the timer fires (common on mobile). Force an
// immediate write whenever the page is about to be hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    autosave.saveNow().catch((err) => console.warn('Autosave failed', err));
  }
});
window.addEventListener('pagehide', () => {
  autosave.saveNow().catch(() => {});
});

initMenu({
  onNew: () => {
    if (doc.shapes.length === 0) return;
    if (!confirm('Start a new collage? This clears everything and can\u2019t be undone.')) return;
    doc.clear();
    camera.setState({ x: 0, y: 0, scale: 1 });
    interaction.clearSelection();
    autosave.saveNow().catch((err) => console.warn('Autosave failed', err));
  },
  onAdd: async (file) => {
    try {
      await doc.addFromFile(file, camera);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not add that SVG file.');
    }
  },
  onOpen: async (file) => {
    try {
      await openFile(file, { doc, camera, interaction, autosave });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not open that file.');
    }
  },
  onExportSvg: () => exportCombinedSvg(doc),
  onExportZip: () => exportZip(doc, camera),
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      // A standalone/installed app instance only checks for a new sw.js on
      // navigation, and it won't necessarily re-navigate just from sitting
      // in the background. So explicitly ask it to check whenever the app
      // regains focus/visibility, not just on initial load.
      const checkForUpdate = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('focus', checkForUpdate);
    }).catch((err) => {
      console.warn('Service worker registration failed', err);
    });

    // Once a newly-installed service worker takes control, reload so the
    // page actually runs the new version instead of the old one lingering
    // until the next manual reload.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
