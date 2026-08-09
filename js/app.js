import { GridCamera } from './grid.js';
import { initMenu } from './menu.js';
import { ShapeDocument } from './shapes.js';

const svg = document.getElementById('canvas');
const camera = new GridCamera(svg);
const doc = new ShapeDocument(svg.querySelector('#world'));

initMenu({
  onAdd: async (file) => {
    try {
      await doc.addFromFile(file, camera);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not add that SVG file.');
    }
  },
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
