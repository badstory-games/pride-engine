import { icon } from './icons.js';

/**
 * Полноэкранная заглушка, показывается при запуске редактора и когда
 * нет открытого проекта. Даёт пользователю два пути:
 *   - создать новый проект (открывает выбор шаблона);
 *   - управлять существующими (открывает менеджер проектов).
 *
 * Редактор при этом скрыт — визуально это выглядит как стартовое окно
 * приложения. Кнопки вызывают соответствующие колбэки; сама заглушка
 * прячется снаружи, когда проект реально открыт.
 */
export class NoProjectScreen {
  constructor({ onCreateProject, onManageProjects } = {}) {
    this.onCreateProject   = onCreateProject   || (() => {});
    this.onManageProjects  = onManageProjects  || (() => {});
    this.el = null;
    this._visible = false;
  }

  isVisible() {
    return this._visible;
  }

  show() {
    if (this._visible) return;
    this._ensure();
    this._visible = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('visible');
  }

  hide() {
    if (!this._visible) return;
    this._visible = false;
    if (!this.el) return;
    this.el.classList.remove('visible');

    const el = this.el;
    setTimeout(() => {
      if (!this._visible) el.hidden = true;
    }, 200);
  }

  _ensure() {
    if (this.el) return;

    const el = document.createElement('div');
    el.className = 'no-project-screen';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'nps-title');

    el.innerHTML = `
      <div class="nps-inner">
        <svg class="nps-logo" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M 32 8 L 52 20 L 52 44 L 32 56 L 12 44 L 12 20 Z"
                stroke="currentColor" stroke-width="2" stroke-linejoin="round"
                fill="none" opacity="0.35"/>
          <path d="M 27 22 V 42 M 27 22 H 34 A 7 7 0 0 1 34 36 H 27"
                stroke="currentColor" stroke-width="4"
                stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="27" cy="22" r="4" fill="currentColor"/>
          <circle cx="27" cy="42" r="4" fill="currentColor"/>
          <circle cx="41" cy="29" r="4" fill="#e6a540"/>
        </svg>
        <h1 class="nps-title" id="nps-title">Pride Engine</h1>
        <div class="nps-actions">
          <button class="nps-btn nps-btn-primary" type="button" data-action="create">
            ${icon('file-plus')}<span>Создать проект</span>
          </button>
          <button class="nps-btn nps-btn-secondary" type="button" data-action="manage">
            ${icon('folder-open')}<span>Управление проектами</span>
          </button>
        </div>
        <div class="nps-footer">
          Начните с шаблона или откройте один из сохранённых проектов
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.el = el;

    el.querySelector('[data-action="create"]').addEventListener('click', () => {
      if (this.onCreateProject) this.onCreateProject();
    });
    el.querySelector('[data-action="manage"]').addEventListener('click', () => {
      if (this.onManageProjects) this.onManageProjects();
    });
  }
}