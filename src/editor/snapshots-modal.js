import { icon } from './icons.js';
import { Modal } from './modal.js';
import { listSnapshots, deleteSnapshot } from '../project/snapshots.js';

/**
 * Модалки для работы со снимками:
 *   promptSave(defaultName) → имя нового снимка или null
 *   pick()                  → { action: 'restore' | 'delete', id } или null
 *
 * При 'delete' список переоткрывается автоматически — пользователь
 * видит результат сразу.
 */
export class SnapshotsModal {
  constructor() {
    this._el = null;
    this._resolver = null;
    this._onKey = this._onKey.bind(this);
  }

  async promptSave(defaultName) {
    return await Modal.prompt({
      title: 'Сохранить снимок',
      message:
        'Снимок — это точка сохранения. Autosave продолжает работать ' +
        'в фоне и снимки не перезаписывает.',
      defaultValue: defaultName,
      placeholder: 'Например: до рефакторинга',
      okText: 'Сохранить',
      cancelText: 'Отмена',
    });
  }

  async pick() {
    while (true) {
      const result = await this._openOnce();
      if (!result) return null;
      if (result.action === 'restore') return result;
      // 'delete' — удаляем и открываем список снова
      deleteSnapshot(result.id);
    }
  }

  _openOnce() {
    return new Promise((resolve) => this._build(resolve));
  }

  _build(resolve) {
    const items = listSnapshots();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'modal-box snapshot-modal';

    const header = document.createElement('div');
    header.className = 'modal-box-header';
    header.innerHTML = `
      <h3>Снимки проекта</h3>
      <p class="snapshot-hint">Отдельные точки сохранения. Autosave их не перезаписывает.</p>
    `;
    box.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-box-body snapshot-body';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'snapshot-empty';
      empty.textContent = 'Пока нет снимков. Нажмите «Сохранить» в топбаре, чтобы создать первый.';
      body.appendChild(empty);
    } else {
      for (const s of items) body.appendChild(this._renderCard(s));
    }
    box.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-box-footer';
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'modal-btn modal-btn-secondary';
    btnCancel.textContent = 'Закрыть';
    btnCancel.addEventListener('click', () => this._close(null));
    footer.appendChild(btnCancel);
    box.appendChild(footer);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this._close(null);
    });

    this._el = backdrop;
    this._resolver = resolve;
    document.addEventListener('keydown', this._onKey, true);

    requestAnimationFrame(() => btnCancel.focus());
  }

  _renderCard(s) {
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.dataset.id = s.id;

    const date = new Date(s.ts).toLocaleString();
    const meta = s.meta || {};

    card.innerHTML = `
      <div class="snapshot-info">
        <div class="snapshot-name" title="${this._esc(s.name)}">${this._esc(s.name)}</div>
        <div class="snapshot-meta">
          ${date}
          · объектов: ${meta.objectCount ?? '—'}
          · событий: ${meta.eventCount ?? '—'}
        </div>
      </div>
      <div class="snapshot-actions">
        <button class="topbtn" data-action="restore" title="Восстановить">
          ${icon('upload')}<span>Восстановить</span>
        </button>
        <button class="snapshot-del" data-action="delete" title="Удалить">
          ${icon('x')}
        </button>
      </div>
    `;

    card.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'restore') {
        const ok = await Modal.confirm({
          title: 'Восстановить снимок?',
          message:
            `Текущее состояние сцены, листа событий и переменных будет ` +
            `заменено на содержимое снимка «${s.name}».\n\n` +
            `Несохранённые изменения будут потеряны.`,
          okText: 'Восстановить',
          cancelText: 'Отмена',
          danger: true,
        });
        if (!ok) return;
        this._close({ action: 'restore', id: s.id });
        return;
      }

      if (action === 'delete') {
        const ok = await Modal.confirm({
          title: 'Удалить снимок?',
          message: `Снимок «${s.name}» будет удалён безвозвратно.`,
          okText: 'Удалить',
          cancelText: 'Отмена',
          danger: true,
        });
        if (!ok) return;
        this._close({ action: 'delete', id: s.id });
      }
    });

    return card;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  _onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._close(null);
    }
  }

  _close(result) {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._el.remove();
    this._el = null;
    const r = this._resolver;
    this._resolver = null;
    if (r) r(result);
  }
}