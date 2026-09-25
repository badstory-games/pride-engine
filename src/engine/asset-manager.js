/**
 * Управление текстурами + persistence пользовательских PNG через IndexedDB.
 *
 * Ассеты изолированы по проекту через scope:
 *   - каждый проект имеет уникальный assetsScope (строка);
 *   - в IndexedDB ключ = `${scope}:${id}`;
 *   - при переключении проекта вызывается useScope(newScope):
 *     пользовательские ассеты из памяти выгружаются, из новой области
 *     восстанавливаются.
 *
 * Ассеты, у которых нет исходного blob (например __white), считаются
 * «системными»: они не выгружаются при смене scope и не пишутся в IDB.
 * Всё остальное — пользовательские, их можно удалять и переименовывать.
 *
 * onTextureDisposed — необязательный колбэк, вызываемый ПЕРЕД destroy()
 * каждой GPU-текстуры. Renderer подписывается, чтобы почистить bind-group
 * cache. Если не задан — destroy() всё равно выполняется.
 */

export class AssetManager {
  constructor(device, opts = {}) {
    this.device = device;

    this.assets   = new Map();
    this.blobs    = new Map();
    this.previews = new Map();
    this.version  = 0;

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

  /**
   * Переключает проектную область. Пользовательские ассеты (у которых
   * есть blob) выгружаются из памяти и заменяются теми, что сохранены
   * для нового scope в IndexedDB. Системные (без blob) остаются.
   *
   * Если во время асинхронной загрузки вызвали useScope() ещё раз —
   * предыдущая загрузка молча прерывается по токену.
   */
  async useScope(scope) {
    if (this._scope === scope) return;
    this._scope = scope;

    const token = {};
    this._scopeToken = token;

    for (const id of [...this.assets.keys()]) {
      if (!this.blobs.has(id)) continue;   // системный — оставляем
      const a = this.assets.get(id);
      if (a && a.texture) this._disposeTexture(a.texture);
      this.assets.delete(id);
      this.blobs.delete(id);
      this.previews.delete(id);
    }

    this._bump();
    await this.restoreFromDb(token);
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

  /** Освобождает GPU-текстуру: сначала сообщает внешнему коду, потом destroy. */
  _disposeTexture(texture) {
    if (!texture) return;
    if (this.onTextureDisposed) {
      try { this.onTextureDisposed(texture); } catch { /* swallow */ }
    }
    try { texture.destroy(); } catch { /* ignore */ }
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
      const req = indexedDB.open('pride-assets', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror   = () => resolve(null);
    });
  }

  async _idbPut(id, blob) {
    const db = await this._dbReady;
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, this._idbKey(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async _idbDelete(id) {
    const db = await this._dbReady;
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').delete(this._idbKey(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async _idbAll() {
    const db = await this._dbReady;
    if (!db) return {};
    return new Promise((resolve) => {
      const out = {};
      const prefix = this._scope ? this._scope + ':' : '';
      const tx = db.transaction('blobs', 'readonly');
      const req = tx.objectStore('blobs').openCursor();
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

  /**
   * Восстанавливает ассеты текущего scope из IndexedDB.
   * @param {object|null} token — если задан, сверяется с this._scopeToken
   *        после каждого await, и при несовпадении загрузка прерывается.
   */
  async restoreFromDb(token = null) {
    const all = await this._idbAll();
    if (token !== null && this._scopeToken !== token) return;

    for (const [id, blob] of Object.entries(all)) {
      if (this.assets.has(id)) continue;
      try {
        const bmp = await createImageBitmap(blob);
        if (token !== null && this._scopeToken !== token) {
          bmp.close();
          return;
        }
        this._upload(id, bmp, blob);
      } catch (e) {
        console.warn(`[assets] restore "${id}" failed:`, e);
      }
    }
    this._bump();
  }

  // ============================================================
  // Loading
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

    const old = this.assets.get(id);
    if (old && old.texture) this._disposeTexture(old.texture);

    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      [width, height]
    );

    bitmap.close();

    this.assets.set(id, { texture, width, height });

    if (blob) {
      this.blobs.set(id, blob);
      this._idbPut(id, blob);
      this._makePreview(id, blob);
    }

    this._bump();
    return { texture, width, height };
  }

  async _makePreview(id, blob) {
    try {
      const url = await blobToDataUrl(blob);
      if (this.blobs.get(id) === blob) {
        this.previews.set(id, url);
        this._bump();
      }
    } catch { /* ignore */ }
  }

  setPreviewUrl(id, url) {
    this.previews.set(id, url);
    this._bump();
  }

  // ============================================================
  // Queries
  // ============================================================

  get(id)          { return this.assets.get(id) || null; }
  getAsset(id)     { return this.assets.get(id) || null; }
  getSourceBlob(id){ return this.blobs.get(id) || null; }
  getPreviewUrl(id){ return this.previews.get(id) || null; }

  has(id)          { return this.assets.has(id); }
  listIds()        { return [...this.assets.keys()]; }

  /** «Системный» = нет исходного blob. Такие нельзя удалять/переименовывать. */
  isBuiltin(id)    { return !this.blobs.has(id); }

  // ============================================================
  // Mutations
  // ============================================================

  remove(id) {
    const a = this.assets.get(id);
    if (a && a.texture) this._disposeTexture(a.texture);
    this.assets.delete(id);
    this.blobs.delete(id);
    this.previews.delete(id);
    this._idbDelete(id);
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
      this._idbDelete(oldId);
      this._idbPut(newId, blob);
    }

    if (this.previews.has(oldId)) {
      this.previews.set(newId, this.previews.get(oldId));
      this.previews.delete(oldId);
    }

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