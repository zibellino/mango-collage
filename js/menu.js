export function initMenu({ onAdd, onNew }) {
  const button = document.getElementById('menu-button');
  const dropdown = document.getElementById('menu-dropdown');
  const newItem = document.getElementById('menu-new');
  const addItem = document.getElementById('menu-add');
  const fileInput = document.getElementById('file-input');

  function closeMenu() {
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== button) {
      closeMenu();
    }
  });

  newItem.addEventListener('click', () => {
    closeMenu();
    if (onNew) onNew();
  });

  addItem.addEventListener('click', () => {
    closeMenu();
    // Reset value first so selecting the same file twice in a row still
    // fires a change event.
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file && onAdd) onAdd(file);
  });
}
