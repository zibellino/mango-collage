import { GridCamera } from './grid.js';
import { initMenu } from './menu.js';

const svg = document.getElementById('canvas');
new GridCamera(svg);

initMenu({
  onAdd: (file) => {
    // TODO: parse the SVG file and place it on the canvas. Shape placement
    // isn't implemented yet — this is just wired up to receive the picked
    // file for now.
    console.log('Add: picked file', file.name);
  },
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
