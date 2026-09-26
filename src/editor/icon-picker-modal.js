import { icon } from './icons.js';

/**
 * Модалка выбора иконки проекта.
 *
 * Показывает сетку из всех пользовательских текстур текущего проекта
 * (системные вроде __white — исключены). Позволяет:
 *   - выбрать текстуру как иконку;
 *   - загрузить новую PNG прямо здесь (создаётся ресурс в панели);
 *   - вернуться к стандартной иконке Pride Engine.
 *
 * Результат pick():
 *   { type: 'asset',   assetId: '...' } — использовать эту текстуру
 *   { type: 'default' }                 — сбросить на фирменную
 *   null                                — закрыли без выбора
 */
export class IconPickerModal {
  constructor(opts = {}) {
    this.assets = opts.assets || null;
    this.editor = opts.editor || null;

    this._el = null;
    this._resolver = null;
    this._onKey = this._onKey.bind(this);
    this._onDocPointer = this._onDocPointer.bind(this);
  }

  isOpen() { return this._el !== null; }

  pick() {
    if (this._el) this.close(null);
    return new Promise((resolve) => {
      this._resolver = resolve;
      this._build();
      document.addEventListener('keydown', this._onKey, true);
      document.addEventListener('pointerdown', this._onDocPointer, true);
    });
  }

  close(result) {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('pointerdown', this._onDocPointer, true);
    this._el.remove();
    this._el = null;
    const r = this._resolver;
    this._resolver = null;
    if (r) r(result);
  }

  // ============================================================
  // Internals
  // ============================================================

  _onDocPointer(e) {
    if (!this._el) return;
    const topMost = document.querySelector('.modal-backdrop:not([hidden])');
    if (topMost && topMost !== this._el) return;
    if (e.target === this._el) this.close(null);
  }

  _onKey(e) {
    if (e.key === 'Escape' && this._el) {
      const topMost = document.querySelector('.modal-backdrop:not([hidden])');
      if (topMost && topMost !== this._el) return;
      e.preventDefault();
      e.stopPropagation();
      this.close(null);
    }
  }

  _build() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop icon-picker-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'icon-picker-box';

    const header = document.createElement('div');
    header.className = 'icon-picker-header';
    header.innerHTML = `
      <h3 class="icon-picker-title">${icon('image')}<span>Иконка проекта</span></h3>
      <button class="modal-close icon-picker-close" title="Закрыть (Esc)">${icon('x')}</button>
    `;
    box.appendChild(header);

    const body = document.createElement('div');
    body.className = 'icon-picker-body';
    box.appendChild(body);

    const ids = this.assets
      ? this.assets.listIds().filter((id) => id !== '__white')
      : [];

    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'icon-picker-empty';
      empty.innerHTML = `
        <div class="icon-picker-empty-text">
          Пока нет своих текстур. Загрузите PNG — он появится в
          панели «Ресурсы» и сразу станет иконкой.
        </div>
        <button type="button" class="topbtn icon-picker-upload">
          ${icon('image')}<span>Загрузить PNG</span>
        </button>
      `;
      empty.querySelector('.icon-picker-upload')
        .addEventListener('click', () => this._onUpload());
      body.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'icon-picker-grid';

      for (const id of ids) {
        grid.appendChild(this._renderTile(id));
      }
      body.appendChild(grid);

      const tools = document.createElement('div');
      tools.className = 'icon-picker-tools';
      tools.innerHTML = `
        <button type="button" class="topbtn icon-picker-upload">
          ${icon('image')}<span>Загрузить PNG</span>
        </button>
      `;
      tools.querySelector('.icon-picker-upload')
        .addEventListener('click', () => this._onUpload());
      body.appendChild(tools);
    }

    const footer = document.createElement('div');
    footer.className = 'icon-picker-footer';
    footer.innerHTML = `
      <button type="button" class="modal-btn modal-btn-secondary icon-picker-reset">
        ${icon('x')}<span>Стандартная иконка</span>
      </button>
      <button type="button" class="modal-btn modal-btn-secondary icon-picker-cancel">
        Отмена
      </button>
    `;
    box.appendChild(footer);

    footer.querySelector('.icon-picker-reset')
      .addEventListener('click', () => this.close({ type: 'default' }));
    footer.querySelector('.icon-picker-cancel')
      .addEventListener('click', () => this.close(null));

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    this._el = backdrop;

    header.querySelector('.icon-picker-close')
      .addEventListener('click', () => this.close(null));
  }

  _renderTile(id) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'icon-picker-tile';
    tile.dataset.assetId = id;
    tile.title = id;
    tile.setAttribute('aria-label', id);

    const url = this.assets.getPreviewUrl(id) || '';
    tile.innerHTML = url
      ? `<img src="${escapeAttr(url)}" alt="">`
      : `<span class="icon-picker-tile-empty"></span>`;

    tile.addEventListener('click', () => {
      this.close({ type: 'asset', assetId: id });
    });
    return tile;
  }

  async _onUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;

      try {
        const bmp = await createImageBitmap(file);
        const base = this._fileToId(file.name);
        const id = this._uniqueId(base);
        this.assets.loadFromBitmap(id, bmp, file);
        this.close({ type: 'asset', assetId: id });
      } catch (e) {
        console.error('[icon-picker] upload failed:', e);
      }
    };

    document.body.appendChild(input);
    input.click();
  }

  _fileToId(filename) {
    const base = String(filename).replace(/\.[^.]+$/, '');
    const clean = base.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
    return clean || 'icon';
  }

  _uniqueId(base) {
    if (!this.assets.has(base)) return base;
    let n = 2;
    while (this.assets.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}