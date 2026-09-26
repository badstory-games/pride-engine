import { icon } from './icons.js';
import { Modal } from './modal.js';

const HIDDEN_IDS = new Set(['__white']);
const PREVIEW_SOUND = '__preview__';

/**
 * Панель ресурсов. Две секции:
 *   - Текстуры — список PNG, rename, delete, preview.
 *   - Звуки    — список аудио, rename, delete, прослушивание, индикатор
 *                фонового декодирования (полоса + счётчик в заголовке).
 *
 * `audio` — опционально. Если передан AudioManager:
 *   - у звуков появляется кнопка ▶/■ для прослушивания;
 *   - в заголовке секции показывается «N / M», пока идёт декодирование;
 *   - у незаготовых строк — полоса загрузки и disabled ▶.
 */
export class AssetsPanel {
  constructor(container, assets, editor, scene, audio = null) {
    this.container = container;
    this.assets    = assets;
    this.editor    = editor;
    this.scene     = scene;
    this.audio     = audio;
    this.onChange  = () => {};

    this._lastVersion = -1;
    this._previewId   = null;
    this._refreshAudioRaf = null;

    this._build();

    this._unsubscribe = assets.onChange(() => {
      this._lastVersion = -1;
      this.refresh();
      this.onChange();
    });

    // Подписка на изменения очереди декодирования.
    if (this.audio) {
      this._prevStateChange = this.audio.onStateChange;
      this.audio.onStateChange = () => {
        if (this._prevStateChange) {
          try { this._prevStateChange(); } catch {}
        }
        this.refreshAudio();
      };
    }
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._refreshAudioRaf != null) {
      cancelAnimationFrame(this._refreshAudioRaf);
      this._refreshAudioRaf = null;
    }
  }

  _build() {
    this.container.innerHTML = `
      <div class="assets-toolbar">
        <h3>Ресурсы</h3>
        <div class="assets-toolbar-actions">
          <button class="topbtn" data-action="upload-image">
            ${icon('image')}<span>Загрузить PNG</span>
          </button>
          <button class="topbtn" data-action="upload-audio">
            ${icon('music')}<span>Загрузить звук</span>
          </button>
        </div>
      </div>

      <div class="assets-section">
        <div class="assets-section-title">
          <span>Текстуры</span>
        </div>
        <div class="assets-list" data-kind="image"></div>
      </div>

      <div class="assets-section">
        <div class="assets-section-title">
          <span>Звуки</span>
          <span class="assets-count" data-count="audio"></span>
        </div>
        <div class="assets-list" data-kind="audio"></div>
      </div>

      <input type="file"
             accept="image/png,image/jpeg,image/webp"
             data-input="image" multiple hidden>
      <input type="file"
             accept="audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/*"
             data-input="audio" multiple hidden>
    `;

    this.imageListEl = this.container.querySelector('.assets-list[data-kind="image"]');
    this.audioListEl = this.container.querySelector('.assets-list[data-kind="audio"]');
    this.imageInput  = this.container.querySelector('input[data-input="image"]');
    this.audioInput  = this.container.querySelector('input[data-input="audio"]');

    this.container.addEventListener('click',  (e) => this._onClick(e));
    this.container.addEventListener('blur',   (e) => this._onBlur(e), true);
    this.container.addEventListener('keydown',(e) => this._onKeydown(e));

    this.imageInput.addEventListener('change', (e) => this._onImagePick(e));
    this.audioInput.addEventListener('change', (e) => this._onAudioPick(e));
  }

  refresh() {
    if (this.assets.version === this._lastVersion) return;
    this._lastVersion = this.assets.version;
    this._renderImages();
    this._renderAudio();
  }

  /** Обновляет только список звуков — вызывается, когда фоновое
   *  декодирование завершилось. Дебаунсится через rAF. */
  refreshAudio() {
    if (this._refreshAudioRaf != null) return;
    this._refreshAudioRaf = requestAnimationFrame(() => {
      this._refreshAudioRaf = null;
      this._renderAudio();
    });
  }

  // ============================================================
  // Текстуры
  // ============================================================

  _renderImages() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('assets-name')) return;

    this.imageListEl.innerHTML = '';

    const ids = this.assets.listIds().filter((id) => !HIDDEN_IDS.has(id));
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'assets-empty';
      empty.textContent = 'Нет текстур. Нажмите «Загрузить PNG».';
      this.imageListEl.appendChild(empty);
      return;
    }

    for (const id of ids) this.imageListEl.appendChild(this._renderImageRow(id));
  }

  _countUsage(textureId) {
    let n = 0;
    const objs = this.scene.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o._dead && o.textureId === textureId) n++;
    }
    return n;
  }

  _renderImageRow(id) {
    const a = this.assets.getAsset(id);
    if (!a) return document.createElement('div');

    const preview   = this.assets.getPreviewUrl(id);
    const isBuiltin = this.assets.isBuiltin(id);
    const canEdit   = !isBuiltin;
    const usedCount = this._countUsage(id);

    const row = document.createElement('div');
    row.className = 'assets-row';
    row.dataset.assetId = id;
    row.dataset.kind = 'image';

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
        ${canEdit ? 'data-action="delete-image"' : 'disabled'}
        title="${canEdit ? 'Удалить' : 'Системный ресурс'}">
        ${icon('x')}
      </button>
    `;
    return row;
  }

  // ============================================================
  // Звуки
  // ============================================================

  _renderAudio() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('assets-name')) return;

    this.audioListEl.innerHTML = '';

    const ids = this.assets.listAudioIds();
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'assets-empty';
      empty.textContent = 'Нет звуков. Нажмите «Загрузить звук».';
      this.audioListEl.appendChild(empty);
      this._updateAudioCounter(0, 0);
      return;
    }

    for (const id of ids) this.audioListEl.appendChild(this._renderAudioRow(id));

    // Счётчик в заголовке.
    let ready = 0;
    if (this.audio) {
      for (const id of ids) if (this.audio.isReady(id)) ready++;
    } else {
      ready = ids.length;
    }
    this._updateAudioCounter(ready, ids.length);
  }

  _updateAudioCounter(ready, total) {
    const el = this.container.querySelector('[data-count="audio"]');
    if (!el) return;
    if (total === 0 || ready === total) {
      el.textContent = '';
      el.classList.remove('pending');
    } else {
      el.textContent = `${ready} / ${total}`;
      el.classList.add('pending');
    }
  }

  _renderAudioRow(id) {
    const blob = this.assets.getAudioBlob(id);
    const sizeKb = blob ? Math.max(1, Math.round(blob.size / 1024)) : 0;
    const duration = this.audio ? this.audio.getDuration(id) : 0;
    const ready = !this.audio || this.audio.isReady(id);
    const decoding = this.audio ? this.audio.isDecoding(id) : false;
    const isPlaying = this.audio && this.audio.isPlaying(PREVIEW_SOUND) &&
                      this._previewId === id;

    const row = document.createElement('div');
    row.className = 'assets-row assets-row-audio';
    row.dataset.assetId = id;
    row.dataset.kind = 'audio';

    const playIcon = isPlaying ? 'stop' : 'play';
    const playTitle = isPlaying ? 'Остановить' : 'Прослушать';
    const playDisabled = !this.audio || !ready;

    let subHtml;
    if (decoding) {
      subHtml = 'Декодируется…';
    } else if (!ready && this.audio) {
      subHtml = '—';
    } else {
      const durStr = duration > 0 ? `${duration.toFixed(2)} с` : '—';
      subHtml = `${durStr} · ${sizeKb} КБ${isPlaying ? ' · играет' : ''}`;
    }

    const progressHtml = decoding
      ? `<div class="assets-audio-progress"><div class="assets-audio-progress-bar"></div></div>`
      : '';

    row.innerHTML = `
      <div class="assets-audio-icon">${icon('music')}</div>
      <div class="assets-meta">
        <input type="text" class="assets-name"
          value="${this._esc(id)}"
          data-asset-name="${this._esc(id)}">
        <div class="assets-sub">${subHtml}</div>
        ${progressHtml}
      </div>
      <button class="assets-play"
        data-action="preview-audio"
        title="${playTitle}"
        ${playDisabled ? 'disabled' : ''}>
        ${icon(playIcon)}
      </button>
      <button class="assets-del"
        data-action="delete-audio"
        title="Удалить">
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
  // Events
  // ============================================================

  _onClick(e) {
    if (e.target.closest('[data-action="upload-image"]')) {
      this.imageInput.value = '';
      this.imageInput.click();
      return;
    }
    if (e.target.closest('[data-action="upload-audio"]')) {
      this.audioInput.value = '';
      this.audioInput.click();
      return;
    }

    const delImg = e.target.closest('[data-action="delete-image"]');
    if (delImg) {
      const row = delImg.closest('.assets-row');
      if (row) this._deleteImage(row.dataset.assetId);
      return;
    }

    const delAud = e.target.closest('[data-action="delete-audio"]');
    if (delAud) {
      const row = delAud.closest('.assets-row');
      if (row) this._deleteAudio(row.dataset.assetId);
      return;
    }

    const play = e.target.closest('[data-action="preview-audio"]');
    if (play) {
      const row = play.closest('.assets-row');
      if (row) this._togglePreview(row.dataset.assetId);
      return;
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
    if (!e.target.classList || !e.target.classList.contains('assets-name')) return;
    const row = e.target.closest('.assets-row');
    if (!row) return;
    if (row.dataset.kind === 'audio') this._commitRenameAudio(e.target);
    else this._commitRenameImage(e.target);
  }

  // ============================================================
  // Загрузка картинок
  // ============================================================

  async _onImagePick(e) {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const bmp = await createImageBitmap(file);
        const base = this._fileToId(file.name);
        const id   = this._uniqueImageId(base);
        this.assets.loadFromBitmap(id, bmp, file);
      } catch (err) {
        console.error('[assets] image upload failed:', file.name, err);
      }
    }
  }

  _fileToId(filename) {
    const base = String(filename).replace(/\.[^.]+$/, '');
    const clean = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
    return clean || 'asset';
  }

  _uniqueImageId(base) {
    if (!this.assets.has(base)) return base;
    let n = 2;
    while (this.assets.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  _uniqueAudioId(base) {
    if (!this.assets.hasAudio(base)) return base;
    let n = 2;
    while (this.assets.hasAudio(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  // ============================================================
  // Загрузка звуков
  // ============================================================

  async _onAudioPick(e) {
    const files = [...(e.target.files || [])];
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const bytes = await file.arrayBuffer();
        const base = this._fileToId(file.name);
        const id   = this._uniqueAudioId(base);

        // Сохраняем сразу; декодирование — в фоновой очереди.
        await this.assets.loadAudio(id, bytes, file);

        if (this.audio) {
          this.audio.queueDecode(id, bytes);
        }
      } catch (err) {
        console.error('[assets] audio upload failed:', file.name, err);
      }
    }

    // Форсированная перерисовка — показать «Декодируется…» сразу.
    this._renderAudio();
  }

  // ============================================================
  // Preview
  // ============================================================

  _togglePreview(id) {
    if (!this.audio) return;
    if (!this.audio.isReady(id)) return;

    if (this.audio.isPlaying(PREVIEW_SOUND) && this._previewId === id) {
      this.audio.stop(PREVIEW_SOUND);
      this._previewId = null;
      this._renderAudio();
      return;
    }
    this.audio.stop(PREVIEW_SOUND);
    this._previewId = id;
    this.audio.play({
      id,
      name: PREVIEW_SOUND,
      volume: 0.7,
      loop: false,
    });
    this._renderAudio();
  }

  // ============================================================
  // Rename
  // ============================================================

  _commitRenameImage(input) {
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

    const objs = this.scene.objects;
    for (let i = 0; i < objs.length; i++) {
      if (objs[i].textureId === oldId) objs[i].textureId = newId;
    }

    this.editor.onChange();
  }

  _commitRenameAudio(input) {
    const row = input.closest('.assets-row');
    if (!row) return;
    const oldId = row.dataset.assetId;

    let newId = String(input.value || '').trim();
    newId = newId.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');

    if (!newId || newId === oldId) { input.value = oldId; return; }

    if (this.assets.hasAudio(newId)) {
      input.value = oldId;
      input.classList.add('invalid');
      setTimeout(() => input.classList.remove('invalid'), 1200);
      return;
    }

    try {
      this.assets.renameAudio(oldId, newId);
    } catch (err) {
      console.warn('[assets] rename audio failed:', err);
      input.value = oldId;
      return;
    }

    // Согласованно переименовываем звук во всех внутренних структурах
    // AudioManager: готовый буфер, промис/очередь декодирования,
    // активные проигрывания. Без этого новый id не находил AudioBuffer
    // и PlaySound(newId) молча ничего не делал.
    if (this.audio) {
      this.audio.rename(oldId, newId);
    }

    if (this.onAudioRenamed) this.onAudioRenamed(oldId, newId);

    this.editor.onChange();
  }

  // ============================================================
  // Delete
  // ============================================================

  async _deleteImage(id) {
    if (HIDDEN_IDS.has(id) || this.assets.isBuiltin(id)) return;

    const usedCount = this._countUsage(id);
    if (usedCount > 0) {
      const ok = await Modal.confirm({
        title: 'Удалить текстуру',
        message:
          `Текстура используется в ${usedCount} объект(ах) сцены. ` +
          `Они перестанут отображаться, пока не будет назначена другая.\n\n` +
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

  async _deleteAudio(id) {
    const ok = await Modal.confirm({
      title: 'Удалить звук',
      message: `Звук «${id}» будет удалён. События, которые его используют, перестанут воспроизводить звук.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    });
    if (!ok) return;

    if (this.audio) {
      this.audio.stop(PREVIEW_SOUND);
      if (this._previewId === id) this._previewId = null;
      this.audio.buffers.delete(id);
    }

    this.assets.removeAudio(id);

    if (this.onAudioRenamed) this.onAudioRenamed(id, null);

    this.editor.onChange();
  }
}