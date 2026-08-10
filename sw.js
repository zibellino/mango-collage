const CACHE_NAME = 'mango-collage-shell';

// The app shell: files that define the app itself. These are always
// fetched from the network first, so a new deploy is picked up on next
// load with no manual cache-version bumping. The cached copy is only used
// as an offline fallback.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/grid.js',
  './js/menu.js',
  './js/shapes.js',
  './js/interaction.js',
  './js/snapping.js',
  './js/persistence.js',
  './js/export.js',
  './js/vendor/fflate.js',
  './icons/icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((path) =>
          fetch(path, { cache: 'no-store' }).then((response) => {
            if (response.ok) return cache.put(path, response);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isAppShellRequest(url) {
  const path = url.pathname;
  return APP_SHELL.some((shellPath) => {
    const normalized = shellPath.replace('./', '/');
    return path === normalized || path.endsWith(normalized);
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url)) {
    // Network-first: always try to get the latest version. cache: 'no-store'
    // bypasses the browser's regular HTTP cache too — without it, fetch()
    // can still return a stale response straight from HTTP caching (e.g.
    // GitHub Pages' cache-control headers) even though the service worker
    // itself is "going to the network". Only fall back to our own cache if
    // the network is unavailable (offline).
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (not currently part of the app shell): cache-first,
  // since it's less likely to change on every deploy.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
