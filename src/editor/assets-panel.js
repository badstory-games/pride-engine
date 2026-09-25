import { icon } from './icons.js';
import { Modal } from './modal.js';

const HIDDEN_IDS = new Set(['__white']);

/**
 * Панель управления ресурсами (текстурами).
 *
 * __white — системная текстура по умолчанию. Она есть в AssetManager,
 * но в списке не отображается: пользователь её не выбирает вручную,
 * она подставляется автоматически при создании объектов без текстуры.
 */
export class AssetsPanel {
  constructor(container, assets, editor, scene) {
    this.container = container;
    this.assets    = assets;
    this.editor    = editor;
    this.scene     = scene;
    this.onChange  = () => {};

    this._lastVersion = -1;
    this._build();

    this._unsubscribe = assets.onChange(() => {
      this._lastVersion = -1;
      this.refresh();
      this.onChange();
    });
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
  }

  _build() {
    this.container.innerHTML = `
      <div class="assets-toolbar">
        <h3>Ресурсы</h3>
        <div class="assets-toolbar-actions">
          <button class="topbtn" data-action="upload">
            ${icon('upload')}<span>Загрузить</span>
          </button>
        </div>
      </div>
      <div class="assets-list"></div>
      <input type="file"
             accept="image/png,image/jpeg,image/webp"
             multiple hidden>
    `;

    this.listEl    = this.container.querySelector('.assets-list');
    this.fileInput = this.container.querySelector('input[type="file"]');

    this.container.addEventListener('click', (e) => this._onClick(e));
    this.container.addEventListener('blur',  (e) => this._onBlur(e), true);
    this.container.addEventListener('keydown', (e) => this._onKeydown(e));

    this.fileInput.addEventListener('change', (e) => this._onFilePick(e));
  }

  refresh() {
    if (this.assets.version === this._lastVersion) return;
    this._lastVersion = this.assets.version;
    this._render();
  }

  // ============================================================
  // RENDER
  // ============================================================

  _render() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('assets-name')) return;

    this.listEl.innerHTML = '';

    // В список попадают все, кроме скрытых системных.
    const ids = this.assets.listIds().filter((id) => !HIDDEN_IDS.has(id));

    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'assets-empty';
      empty.textContent = 'Нет загруженных ресурсов. Нажмите «Загрузить», чтобы добавить PNG.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const id of ids) this.listEl.appendChild(this._renderRow(id));
  }

  _renderRow(id) {
    const a = this.assets.getAsset(id);
    if (!a) return document.createElement('div');

    const preview   = this.assets.getPreviewUrl(id);
    const isBuiltin = this.assets.isBuiltin(id);
    const canEdit   = !isBuiltin;
    const usedCount = this.scene.objects.filter((o) => o.textureId === id).length;

    const row = document.createElement('div');
    row.className = 'assets-row';
    row.dataset.assetId = id;

    const previewHtml = preview
      ? `<img src="${preview}" alt="">`
      : '<span class="assets-preview-empty"></span>';

    row.innerHTML = `
      <div class="assets-preview">${previewHtml}</div>
      <div class="assets-meta">
        <input type="text" class="assets-name"
          value="${this._esc(id)}"
          ${canEdit ? '' : 'disabled'}
          data-asset-name="${this._esc(id)}">
        <div class="assets-sub">
          ${a.width}×${a.height}${usedCount ? ` · объектов: ${usedCount}` : ''}${isBuiltin ? ' · системный' : ''}
        </div>
      </div>
      <button class="assets-del"
        ${canEdit ? 'data-action="delete"' : 'disabled'}
        title="${canEdit ? 'Удалить' : 'Системный ресурс'}">
        ${icon('x')}
      </button>
    `;
    return row;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ============================================================
  // EVENTS
  // ============================================================

  _onClick(e) {
    if (e.target.closest('[data-action="upload"]')) {
      this.fileInput.value = '';
      this.fileInput.click();
      return;
    }
    const del = e.target.closest('[data-action="delete"]');
    if (del) {
      const row = del.closest('.assets-row');
      if (!row) return;
      this._deleteAsset(row.dataset.assetId);
    }
  }

  _onKeydown(e) {
    if (e.key === 'Enter' && e.target.classList &&
        e.target.classList.contains('assets-name')) {
      e.preventDefault();
      e.target.blur();
    }
  }

  _onBlur(e) {
    if (e.target.classList && e.target.classList.contains('assets-name')) {
      this._commitRename(e.target);
    }
  }

  async _onFilePick(e) {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const bmp = await createImageBitmap(file);
        const base = this._fileToId(file.name);
        const id   = this._uniqueId(base);
        this.assets.loadFromBitmap(id, bmp, file);
      } catch (err) {
        console.error('[assets] upload failed:', file.name, err);
      }
    }
  }

  _fileToId(filename) {
    const base = String(filename).replace(/\.[^.]+$/, '');
    const clean = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
    return clean || 'asset';
  }

  _uniqueId(base) {
    if (!this.assets.has(base)) return base;
    let n = 2;
    while (this.assets.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  // ============================================================
  // RENAME
  // ============================================================

  _commitRename(input) {
    const row = input.closest('.assets-row');
    if (!row) return;
    const oldId = row.dataset.assetId;

    if (HIDDEN_IDS.has(oldId) || this.assets.isBuiltin(oldId)) {
      input.value = oldId;
      return;
    }

    let newId = String(input.value || '').trim();
    newId = newId.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');

    if (!newId || newId === oldId) { input.value = oldId; return; }
    if (HIDDEN_IDS.has(newId)) { input.value = oldId; return; }

    if (this.assets.has(newId)) {
      input.value = oldId;
      input.classList.add('invalid');
      setTimeout(() => input.classList.remove('invalid'), 1200);
      return;
    }

    try {
      this.assets.rename(oldId, newId);
    } catch (err) {
      console.warn('[assets] rename failed:', err);
      input.value = oldId;
      return;
    }

    for (const o of this.scene.objects) {
      if (o.textureId === oldId) o.textureId = newId;
    }

    this.editor.onChange();
  }

  // ============================================================
  // DELETE
  // ============================================================

  async _deleteAsset(id) {
    if (HIDDEN_IDS.has(id) || this.assets.isBuiltin(id)) return;

    const usedCount = this.scene.objects.filter((o) => o.textureId === id).length;

    if (usedCount > 0) {
      const ok = await Modal.confirm({
        title: 'Удалить ресурс',
        message:
          `Ресурс используется в ${usedCount} объект(ах) сцены. ` +
          `Они перестанут отображаться, пока не будет назначена другая текстура.\n\n` +
          `Продолжить?`,
        okText: 'Удалить',
        cancelText: 'Отмена',
        danger: true,
      });
      if (!ok) return;
    }

    this.assets.remove(id);
    this.editor.onChange();
  }
}