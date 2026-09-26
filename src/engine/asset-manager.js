import { TextureAtlas } from './texture-atlas.js';

/**
 * Управление ресурсами: текстуры + звуки.
 *
 *  - Текстуры упаковываются в TextureAtlas (см. texture-atlas.js).
 *  - Звуки хранятся как blob'ы; декодирование в AudioBuffer делает
 *    AudioManager отдельно — AssetManager только persistence.
 *
 * Persistence:
 *   - IndexedDB 'pride-assets' v2;
 *   - два object store: 'blobs' (картинки) и 'audio' (звуки);
 *   - ключи в обоих — `${scope}:${id}`.
 *
 * Scope изолирует проекты: при useScope(old → new) ассеты прошлого
 * проекта выгружаются из памяти, из новой области восстанавливаются.
 * Системная текстура __white не выгружается никогда.
 *
 * onChange() вызывается при любом изменении — картинки или звуки.
 */
export class AssetManager {
  constructor(device, opts = {}) {
    this.device = device;
    this.atlasSize    = opts.atlasSize    ?? 4096;
    this.atlasPadding = opts.atlasPadding ?? 2;

    this.assets   = new Map();
    this.blobs    = new Map();
    this.previews = new Map();

    this.audioBlobs  = new Map();
    this.audioBytes  = new Map();
    this.audioMimes  = new Map();

    this.version  = 0;

    /** @type {TextureAtlas[]} */
    this._pages = [];

    this._scope = null;
    this._scopeToken = null;
    this._listeners = new Set();

    this.onTextureDisposed = typeof opts.onTextureDisposed === 'function'
      ? opts.onTextureDisposed
      : null;

    this._db = null;
    this._dbReady = this._openDb();
  }

  // ============================================================
  // Scope
  // ============================================================

  get scope() { return this._scope; }

  async useScope(scope) {
    if (this._scope === scope) return;
    this._scope = scope;

    const token = {};
    this._scopeToken = token;

    for (const page of this._pages) this._disposePage(page);
    this._pages.length = 0;

    this.assets.clear();
    this.blobs.clear();
    this.previews.clear();

    this.audioBlobs.clear();
    this.audioBytes.clear();
    this.audioMimes.clear();

    this._bump();

    await this._ensureWhite();
    await this.restoreFromDb(token);
  }

  /**
   * Полностью удаляет все записи ассетов указанного scope из IndexedDB.
   * Используется при удалении проекта.
   */
  async deleteScope(scope) {
    const db = await this._dbReady;
    if (!db) return;

    const prefix = scope + ':';
    const purge = (storeName) => new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          if (String(cur.key).startsWith(prefix)) cur.delete();
          cur.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });

    await purge('blobs');
    await purge('audio');

    // Если scope совпадает с активным — чистим карты в памяти.
    if (this._scope === scope) {
      this.assets.clear();
      this.blobs.clear();
      this.previews.clear();
      this.audioBlobs.clear();
      this.audioBytes.clear();
      this.audioMimes.clear();
      for (const page of this._pages) this._disposePage(page);
      this._pages.length = 0;
      this._bump();
    }
  }

  async _ensureWhite() {
    const existing = this.assets.get('__white');
    if (existing && this._pages[existing.pageIndex]) return;
    if (existing) {
      this.assets.delete('__white');
      this.previews.delete('__white');
    }

    const img = new ImageData(1, 1);
    img.data.set([255, 255, 255, 255]);
    const bmp = await createImageBitmap(img);
    this._upload('__white', bmp);
    bmp.close?.();

    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 8, 8);
    this.previews.set('__white', c.toDataURL('image/png'));
  }

  // ============================================================
  // Подписка
  // ============================================================

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _bump() {
    this.version++;
    for (const fn of this._listeners) {
      try { fn(); } catch (e) { console.error('[assets] listener error:', e); }
    }
  }

  _disposePage(page) {
    if (this.onTextureDisposed) {
      try { this.onTextureDisposed(page.texture); } catch {}
    }
    try { page.destroy(); } catch {}
  }

  // ============================================================
  // IndexedDB
  // ============================================================

  _idbKey(id) {
    return this._scope ? `${this._scope}:${id}` : id;
  }

  async _openDb() {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve) => {
      const req = indexedDB.open('pride-assets', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio');
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror   = () => resolve(null);
    });
  }

  async _idbPut(store, id, value) {
    const db = await this._dbReady;
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, this._idbKey(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async _idbDelete(store, id) {
    const db = await this._dbReady;
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(this._idbKey(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async _idbAll(store) {
    const db = await this._dbReady;
    if (!db) return {};
    return new Promise((resolve) => {
      const out = {};
      const prefix = this._scope ? this._scope + ':' : '';
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          const key = String(cur.key);
          if (!prefix || key.startsWith(prefix)) {
            const rawId = prefix ? key.slice(prefix.length) : key;
            out[rawId] = cur.value;
          }
          cur.continue();
        } else resolve(out);
      };
      req.onerror = () => resolve({});
    });
  }

  async restoreFromDb(token = null) {
    const imgs = await this._idbAll('blobs');
    if (token !== null && this._scopeToken !== token) return;
    for (const [id, blob] of Object.entries(imgs)) {
      if (this.assets.has(id)) continue;
      try {
        const bmp = await createImageBitmap(blob);
        if (token !== null && this._scopeToken !== token) { bmp.close(); return; }
        this._upload(id, bmp, blob);
      } catch (e) {
        console.warn(`[assets] restore image "${id}" failed:`, e);
      }
    }

    const sounds = await this._idbAll('audio');
    if (token !== null && this._scopeToken !== token) return;
    for (const [id, blob] of Object.entries(sounds)) {
      if (this.audioBlobs.has(id)) continue;
      try {
        const bytes = await blob.arrayBuffer();
        this.audioBlobs.set(id, blob);
        this.audioBytes.set(id, bytes);
        this.audioMimes.set(id, blob.type || '');
      } catch (e) {
        console.warn(`[assets] restore sound "${id}" failed:`, e);
      }
    }

    this._bump();
  }

  // ============================================================
  // Картинки — Loading
  // ============================================================

  async loadPNG(id, url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    return this._upload(id, bitmap, blob);
  }

  loadFromBitmap(id, bitmap, blob = null) {
    return this._upload(id, bitmap, blob);
  }

  _upload(id, bitmap, blob = null) {
    const width  = bitmap.width;
    const height = bitmap.height;

    let pageIndex = 0;
    let page = this._pages[0];

    let found = false;
    for (let i = 0; i < this._pages.length; i++) {
      if (this._pages[i].canFit(width, height)) {
        page = this._pages[i];
        pageIndex = i;
        found = true;
        break;
      }
    }

    if (!found) {
      if (width + this.atlasPadding * 2 > this.atlasSize ||
          height + this.atlasPadding * 2 > this.atlasSize) {
        throw new Error(
          `[assets] "${id}" (${width}×${height}) не влезает в страницу ` +
          `атласа ${this.atlasSize}×${this.atlasSize}. Увеличьте atlasSize.`
        );
      }
      page = new TextureAtlas(this.device, this.atlasSize, this.atlasPadding);
      this._pages.push(page);
      pageIndex = this._pages.length - 1;
    }

    const uv = page.tryAdd(bitmap, width, height);
    if (!uv) {
      bitmap.close?.();
      throw new Error(`[assets] atlas packing failed for "${id}"`);
    }
    bitmap.close?.();

    this.assets.set(id, {
      width, height, pageIndex,
      u0: uv.u0, v0: uv.v0, u1: uv.u1, v1: uv.v1,
    });

    if (blob) {
      this.blobs.set(id, blob);
      this._idbPut('blobs', id, blob);
      this._makePreview(id, blob);
    }

    this._bump();
    return this.assets.get(id);
  }

  async _makePreview(id, blob) {
    try {
      const url = await blobToDataUrl(blob);
      if (this.blobs.get(id) === blob) {
        this.previews.set(id, url);
        this._bump();
      }
    } catch {}
  }

  setPreviewUrl(id, url) {
    this.previews.set(id, url);
    this._bump();
  }

  // ============================================================
  // Картинки — Queries
  // ============================================================

  get(id)          { return this.assets.get(id) || null; }
  getAsset(id)     { return this.assets.get(id) || null; }
  getSourceBlob(id){ return this.blobs.get(id) || null; }
  getPreviewUrl(id){ return this.previews.get(id) || null; }
  has(id)          { return this.assets.has(id); }
  listIds()        { return [...this.assets.keys()]; }
  isBuiltin(id)    { return !this.blobs.has(id); }

  getAtlasTexture(pageIndex = 0) {
    const page = this._pages[pageIndex];
    return page ? page.texture : null;
  }
  get pageCount() { return this._pages.length; }
  getTexture(id) {
    const a = this.assets.get(id);
    return a ? this.getAtlasTexture(a.pageIndex) : null;
  }

  // ============================================================
  // Звуки — Loading
  // ============================================================

  async loadAudio(id, bytes, blob) {
    const mime = (blob && blob.type) || '';
    this.audioBlobs.set(id, blob);
    this.audioBytes.set(id, bytes);
    this.audioMimes.set(id, mime);

    await this._idbPut('audio', id, blob);
    this._bump();
    return { id, bytes, blob, mime };
  }

  // ============================================================
  // Звуки — Queries
  // ============================================================

  hasAudio(id)       { return this.audioBlobs.has(id); }
  getAudioBlob(id)   { return this.audioBlobs.get(id) || null; }
  getAudioBytes(id)  { return this.audioBytes.get(id) || null; }
  getAudioMime(id)   { return this.audioMimes.get(id) || ''; }
  listAudioIds()     { return [...this.audioBlobs.keys()]; }

  // ============================================================
  // Mutations
  // ============================================================

  remove(id) {
    this.assets.delete(id);
    this.blobs.delete(id);
    this.previews.delete(id);
    this._idbDelete('blobs', id);
    this._bump();
  }

  removeAudio(id) {
    this.audioBlobs.delete(id);
    this.audioBytes.delete(id);
    this.audioMimes.delete(id);
    this._idbDelete('audio', id);
    this._bump();
  }

  rename(oldId, newId) {
    if (oldId === newId) return;
    if (!this.assets.has(oldId)) return;
    if (this.assets.has(newId)) throw new Error(`Asset "${newId}" already exists`);

    this.assets.set(newId, this.assets.get(oldId));
    this.assets.delete(oldId);

    if (this.blobs.has(oldId)) {
      const blob = this.blobs.get(oldId);
      this.blobs.delete(oldId);
      this.blobs.set(newId, blob);
      this._idbDelete('blobs', oldId);
      this._idbPut('blobs', newId, blob);
    }

    if (this.previews.has(oldId)) {
      this.previews.set(newId, this.previews.get(oldId));
      this.previews.delete(oldId);
    }

    this._bump();
  }

  renameAudio(oldId, newId) {
    if (oldId === newId) return;
    if (!this.audioBlobs.has(oldId)) return;
    if (this.audioBlobs.has(newId)) {
      throw new Error(`Sound "${newId}" already exists`);
    }

    this.audioBlobs.set(newId, this.audioBlobs.get(oldId));
    this.audioBlobs.delete(oldId);
    this.audioBytes.set(newId, this.audioBytes.get(oldId));
    this.audioBytes.delete(oldId);
    this.audioMimes.set(newId, this.audioMimes.get(oldId));
    this.audioMimes.delete(oldId);

    this._idbDelete('audio', oldId);
    this._idbPut('audio', newId, this.audioBlobs.get(newId));
    this._bump();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}