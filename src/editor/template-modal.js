import { TEMPLATES } from './templates.js';
import { icon } from './icons.js';

/**
 * Модалка выбора шаблона при создании нового проекта.
 *   const id = await modal.pick();
 *   if (id) { ... }
 *
 * Возвращает id шаблона или null (отмена / Esc / клик по фону).
 */
export class TemplateModal {
  constructor() {
    this._el = null;
    this._resolver = null;
    this._onKey = this._onKey.bind(this);
  }

  pick() {
    if (this._el) this._close(null);

    return new Promise((resolve) => {
      this._resolver = resolve;
      this._build();
      document.addEventListener('keydown', this._onKey, true);
    });
  }

  _build() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'modal-box template-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-box-header';
    header.innerHTML = `
      <h3>Новый проект</h3>
      <p class="template-modal-hint">
        Текущая сцена и лист событий будут заменены. Несохранённые изменения будут потеряны.
      </p>
    `;
    box.appendChild(header);

    // Body: карточки
    const body = document.createElement('div');
    body.className = 'modal-box-body template-modal-body';

    for (const t of TEMPLATES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      card.dataset.templateId = t.id;
      card.innerHTML = `
        <span class="template-card-icon">${icon(t.icon)}</span>
        <span class="template-card-name">${t.name}</span>
        <span class="template-card-desc">${t.description}</span>
      `;
      card.addEventListener('click', () => this._close(t.id));
      body.appendChild(card);
    }
    box.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-box-footer';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'modal-btn modal-btn-secondary';
    btnCancel.textContent = 'Отмена';
    btnCancel.addEventListener('click', () => this._close(null));

    footer.appendChild(btnCancel);
    box.appendChild(footer);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    // Клик по фону = отмена
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this._close(null);
    });

    this._el = backdrop;
    requestAnimationFrame(() => btnCancel.focus());
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