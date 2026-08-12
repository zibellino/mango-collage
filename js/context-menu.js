// A small floating popup menu shown near a long-pressed shape, offering
// per-shape actions. Reuses the single #shape-context-menu element already
// in index.html (styled via the shared .popup-menu class, same as the
// hamburger dropdown) rather than creating DOM on the fly each time.

let bound = false;

function ensureBound(menuEl) {
  if (bound) return;
  bound = true;
  // Dismiss on any tap/click outside the menu. This doesn't stop the same
  // event from also reaching the canvas underneath — that's deliberate,
  // matching how the hamburger dropdown already behaves: dismiss-and-act
  // in one tap feels natural rather than requiring two separate taps.
  document.addEventListener('pointerdown', (e) => {
    if (!menuEl.hidden && !menuEl.contains(e.target)) {
      hideShapeContextMenu();
    }
  });
}

export function hideShapeContextMenu() {
  const menuEl = document.getElementById('shape-context-menu');
  if (menuEl) menuEl.hidden = true;
}

export function showShapeContextMenu(clientX, clientY, { onRemove, onReplace }) {
  const menuEl = document.getElementById('shape-context-menu');
  ensureBound(menuEl);

  menuEl.innerHTML = '';

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.setAttribute('role', 'menuitem');
  removeBtn.addEventListener('click', () => {
    hideShapeContextMenu();
    onRemove();
  });

  const replaceBtn = document.createElement('button');
  replaceBtn.textContent = 'Replace';
  replaceBtn.setAttribute('role', 'menuitem');
  replaceBtn.addEventListener('click', () => {
    hideShapeContextMenu();
    onReplace();
  });

  menuEl.appendChild(removeBtn);
  menuEl.appendChild(replaceBtn);
  menuEl.hidden = false;

  // Measure after unhiding (offsetWidth/Height are 0 while hidden), then
  // clamp so the menu never renders partly off-screen near an edge.
  const rect = menuEl.getBoundingClientRect();
  const x = Math.min(clientX, window.innerWidth - rect.width - 8);
  const y = Math.min(clientY, window.innerHeight - rect.height - 8);
  menuEl.style.left = `${Math.max(8, x)}px`;
  menuEl.style.top = `${Math.max(8, y)}px`;
}
