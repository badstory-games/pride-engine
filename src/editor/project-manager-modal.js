import { icon } from './icons.js';
import { Modal } from './modal.js';
import { projectIconHtml } from './project-icons.js';

/**
 * Модалка управления проектами.
 *
 * Колбэки:
 *   getCurrentProjectId() → string|null
 *   onOpen(id)            → Promise
 *   onCreateNew()         → Promise
 *   onDuplicate(id)       → Promise
 *   onRename(id, newName) → Promise
 *   onDelete(id)          → Promise
 *   listProjects()        → Promise<Meta[]>
 *   onClose()             → вызывается после закрытия модалки.
 */
export class ProjectManagerModal {
  constructor(opts = {}) {
    this.getCurrentProjectId = opts.getCurrentProjectId || (() => null);
    this.onOpen       = opts.onOpen       || null;
    this.onCreateNew  = opts.onCreateNew  || null;
    this.onDuplicate  = opts.onDuplicate  || null;
    this.onRename     = opts.onRename     || null;
    this.onDelete     = opts.onDelete     || null;
    this.onClose      = opts.onClose      || null;
    this.listProjects = opts.listProjects || null;

    this._el = null;
    this._onKey = this._onKey.bind(this);
    this._onDocPointer = this._onDocPointer.bind(this);
  }

  isOpen() { return this._el !== null; }

  async open() {
    if (this._el) return;

    const projects = this.listProjects
      ? await this.listProjects()
      : [];

    this._build(projects);
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('pointerdown', this._onDocPointer, true);
  }

  close() {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('pointerdown', this._onDocPointer, true);
    this._el.remove();
    this._el = null;

    if (this.onClose) {
      try { this.onClose(); } catch (e) { console.error('[pm] onClose:', e); }
    }
  }

  async refresh() {
    if (!this._el) return;
    const listEl = this._el.querySelector('.pm-list');
    if (!listEl) return;

    const projects = this.listProjects
      ? await this.listProjects()
      : [];
    listEl.innerHTML = '';
    this._renderList(listEl, projects);
  }

  // ============================================================
  // Internals
  // ============================================================

  _onDocPointer(e) {
    if (!this._el) return;
    const topMost = document.querySelector('.modal-backdrop:not([hidden])');
    if (topMost && topMost !== this._el) return;
    if (e.target === this._el) this.close();
  }

  _onKey(e) {
    if (e.key === 'Escape' && this._el) {
      const topMost = document.querySelector('.modal-backdrop:not([hidden])');
      if (topMost && topMost !== this._el) return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  _build(projects) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop pm-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'pm-box';

    const header = document.createElement('div');
    header.className = 'pm-header';
    header.innerHTML = `
      <h2 class="pm-title">${icon('folder-open')}<span>Проекты</span></h2>
      <button class="modal-close pm-close" title="Закрыть (Esc)">${icon('x')}</button>
    `;
    box.appendChild(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'pm-toolbar';
    toolbar.innerHTML = `
      <input type="text" class="pm-search" placeholder="Поиск…" autocomplete="off" spellcheck="false">
      <button type="button" class="topbtn pm-create">
        ${icon('file-plus')}<span>Создать</span>
      </button>
    `;
    box.appendChild(toolbar);

    const list = document.createElement('div');
    list.className = 'pm-list';
    box.appendChild(list);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this._el = backdrop;

    header.querySelector('.pm-close').addEventListener('click', () => this.close());

    const searchEl = toolbar.querySelector('.pm-search');
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      for (const card of list.querySelectorAll('.pm-card')) {
        const name = card.dataset.name || '';
        const match = !q || name.toLowerCase().includes(q);
        card.hidden = !match;
      }
    });

    toolbar.querySelector('.pm-create').addEventListener('click', () => this._onCreateClick());

    this._renderList(list, projects);

    requestAnimationFrame(() => searchEl.focus());
  }

  _renderList(listEl, projects) {
    const currentId = this.getCurrentProjectId();

    if (!projects.length) {
      listEl.innerHTML = `
        <div class="pm-empty">
          <div class="pm-empty-icon">${icon('folder-open')}</div>
          <div class="pm-empty-title">Пока нет проектов</div>
          <div class="pm-empty-hint">Создайте первый проект, чтобы начать.</div>
          <button type="button" class="topbtn pm-empty-create">
            ${icon('file-plus')}<span>Создать проект</span>
          </button>
        </div>
      `;
      const btn = listEl.querySelector('.pm-empty-create');
      if (btn) btn.addEventListener('click', () => this._onCreateClick());
      return;
    }

    for (const p of projects) {
      listEl.appendChild(this._renderCard(p, currentId));
    }
  }

  _renderCard(meta, currentId) {
    const card = document.createElement('div');
    card.className = 'pm-card';
    card.dataset.id = meta.id;
    card.dataset.name = meta.name || 'Untitled';
    if (meta.id === currentId) card.classList.add('current');

    const dateStr = meta.updatedAt
      ? new Date(meta.updatedAt).toLocaleString()
      : '—';

    const objectCount = meta.objectCount ?? '—';
    const eventCount  = meta.eventCount  ?? '—';

    card.innerHTML = `
      <div class="pm-card-icon">${projectIconHtml(meta.icon)}</div>
      <div class="pm-card-info">
        <div class="pm-card-name" title="${this._esc(meta.name || 'Untitled')}">
          ${this._esc(meta.name || 'Untitled')}
          ${meta.id === currentId ? '<span class="pm-badge">открыт</span>' : ''}
        </div>
        <div class="pm-card-meta">
          ${objectCount} объектов · ${eventCount} событий
        </div>
        <div class="pm-card-date">${this._esc(dateStr)}</div>
      </div>
      <div class="pm-card-actions">
        <button class="topbtn pm-open" data-action="open" title="Открыть">
          ${icon('play')}<span>Открыть</span>
        </button>
        <button class="pm-iconbtn" data-action="duplicate" title="Дублировать">${icon('copy')}</button>
        <button class="pm-iconbtn" data-action="rename" title="Переименовать">${icon('file-plus')}</button>
        <button class="pm-iconbtn pm-iconbtn-danger" data-action="delete" title="Удалить">${icon('x')}</button>
      </div>
    `;

    card.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      e.stopPropagation();

      switch (action) {
        case 'open':      await this._openCard(meta); break;
        case 'duplicate': await this._duplicateCard(meta); break;
        case 'rename':    await this._renameCard(meta); break;
        case 'delete':    await this._deleteCard(meta); break;
      }
    });

    card.addEventListener('dblclick', async (e) => {
      if (e.target.closest('button')) return;
      await this._openCard(meta);
    });

    return card;
  }

  async _openCard(meta) {
    if (meta.id === this.getCurrentProjectId()) {
      this.close();
      return;
    }
    if (this.onOpen) {
      await this.onOpen(meta.id);
    }
    this.close();
  }

  async _duplicateCard(meta) {
    if (!this.onDuplicate) return;
    await this.onDuplicate(meta.id);
    await this.refresh();
  }

  async _renameCard(meta) {
    const newName = await Modal.prompt({
      title: 'Переименовать проект',
      message: 'Введите новое имя проекта.',
      defaultValue: meta.name || 'Untitled',
      placeholder: 'Имя проекта',
      okText: 'Сохранить',
      cancelText: 'Отмена',
    });
    if (newName === null) return;

    const trimmed = String(newName).trim();
    if (!trimmed || trimmed === meta.name) return;

    if (this.onRename) await this.onRename(meta.id, trimmed);
    await this.refresh();
  }

  async _deleteCard(meta) {
    const ok = await Modal.confirm({
      title: 'Удалить проект',
      message:
        `Проект «${meta.name || 'Untitled'}» будет удалён безвозвратно.\n\n` +
        `Вместе с ним удалятся все снимки, текстуры и звуки, привязанные ` +
        `к этому проекту.`,
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    });
    if (!ok) return;

    if (this.onDelete) await this.onDelete(meta.id);
    await this.refresh();
  }

  async _onCreateClick() {
    if (!this.onCreateNew) return;
    await this.onCreateNew();
    if (this._el) await this.refresh();
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}