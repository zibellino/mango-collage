export function initMenu({ onAdd, onNew, onOpen, onExportSvg, onExportZip }) {
  const button = document.getElementById('menu-button');
  const dropdown = document.getElementById('menu-dropdown');
  const newItem = document.getElementById('menu-new');
  const openItem = document.getElementById('menu-open');
  const addItem = document.getElementById('menu-add');
  const exportSvgItem = document.getElementById('menu-export-svg');
  const exportZipItem = document.getElementById('menu-export-zip');
  const fileInput = document.getElementById('file-input');
  const openInput = document.getElementById('open-input');

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

  openItem.addEventListener('click', () => {
    closeMenu();
    openInput.value = '';
    openInput.click();
  });

  openInput.addEventListener('change', () => {
    const file = openInput.files && openInput.files[0];
    if (file && onOpen) onOpen(file);
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

  exportSvgItem.addEventListener('click', () => {
    closeMenu();
    if (onExportSvg) onExportSvg();
  });

  exportZipItem.addEventListener('click', () => {
    closeMenu();
    if (onExportZip) onExportZip();
  });
}
