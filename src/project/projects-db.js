/**
 * IndexedDB-хранилище метаданных проектов.
 *
 *   Store "projects" (keyPath: "id"):
 *     { id, name, createdAt, updatedAt, canvasWidth, canvasHeight,
 *       bgColor, objectCount, eventCount, assetsScope }
 *
 *   Store "meta" (keyPath: "key"):
 *     { key: "lastOpened", value: <projectId> }
 *
 * Сами данные проектов (сцена, лист событий, переменные) лежат в
 * localStorage под ключом `pride.project.<id>`. Снимки — под
 * `pride.snapshot.<id>.*`. Ассеты — в отдельной БД `pride-assets`,
 * привязаны к project scope.
 */

const DB_NAME = 'pride-projects';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_META = 'meta';

class ProjectsDBImpl {
  constructor() {
    this._db = null;
    this._ready = this._open();
  }

  _open() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror   = () => resolve(null);
    });
  }

  async ready() { return this._ready; }

  async list() {
    const db = await this._ready;
    if (!db) return [];
    return new Promise((resolve) => {
      const out = [];
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { out.push(cur.value); cur.continue(); }
        else {
          out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(out);
        }
      };
      req.onerror = () => resolve([]);
    });
  }

  async get(id) {
    const db = await this._ready;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  }

  async put(meta) {
    const db = await this._ready;
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async delete(id) {
    const db = await this._ready;
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async getMeta(key) {
    const db = await this._ready;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror   = () => resolve(null);
    });
  }

  async setMeta(key, value) {
    const db = await this._ready;
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }
}

export const projectsDB = new ProjectsDBImpl();

export function makeProjectId() {
  return 'proj_' +
    Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}

export function makeAssetsScope() {
  return 'p_' +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4);
}