# Mango Collage

A small installable web app (PWA) for arranging SVG shapes on a zoomable,
pannable grid.

## Running locally

No build step, no dependencies. Serve the folder over HTTP (needed for the
service worker and manifest to work) and open it, for example:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Opening `index.html` directly via `file://` will mostly work for the canvas
and grid, but the service worker (offline caching) won't register on a
`file://` origin.

## Deployment
https://zibellino.github.io/mango-collage/

Static site, deployed via GitHub Pages directly from this repo (no build
step). Enable Pages in the repo settings, pointing at the branch/folder this
file lives in.

## Structure

- `index.html` — app shell
- `css/style.css` — styling
- `js/app.js` — entry point, wires everything together
- `js/grid.js` — SVG canvas camera: pan, pinch-zoom, and the background grid
- `js/menu.js` — hamburger menu
- `manifest.json`, `sw.js`, `icons/` — PWA install/offline support

