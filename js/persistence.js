// Silent autosave of the whole session (shapes + camera position/zoom) to
// IndexedDB, so a reload or reopening the installed app resumes exactly
// where you left off. No explicit save action, no user-visible state.
//
// IndexedDB over localStorage: shape data includes full SVG source text
// per shape, which can add up fast and would blow past localStorage's
// ~5MB synchronous, string-only storage. IndexedDB is async and has a much
// larger practical quota.

const DB_NAME = 'mango-collage';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const RECORD_KEY = 'current';

// Writes during a drag would otherwise fire on every pointermove — this
// coalesces rapid changes into one write shortly after they stop.
const DEBOUNCE_MS = 400;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class Autosave {
  constructor(doc, camera) {
    this.doc = doc;
    this.camera = camera;
    this._dbPromise = openDb();
    this._timer = null;
  }

  // Loads the saved session, if any, and applies it to the document/camera.
  // Returns true if something was restored.
  async load() {
    const db = await this._dbPromise;
    const saved = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (!saved) return false;

    for (const shape of saved.shapes || []) {
      try {
        this.doc.restoreShape(shape);
      } catch (err) {
        // Don't let one corrupt/unreadable shape block the rest of the
        // session from restoring.
        console.warn('Failed to restore a saved shape', shape && shape.name, err);
      }
    }

    if (saved.camera) {
      this.camera.setState(saved.camera);
    }

    return true;
  }

  // Call after any change. Debounced — safe to call on every pointermove.
  scheduleSave() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), DEBOUNCE_MS);
  }

  // Writes immediately, bypassing the debounce. Used as a safety net when
  // the page is about to be hidden/backgrounded, since a pending debounced
  // save might never get to run if the tab is killed in the meantime.
  async saveNow() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const record = {
      shapes: this.doc.serialize(),
      camera: { ...this.camera.camera },
    };

    const db = await this._dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
