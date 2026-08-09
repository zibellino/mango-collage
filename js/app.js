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
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
