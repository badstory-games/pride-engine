import { icon } from './icons.js';
import { logger } from './logger.js';

const LEVEL_LABELS = {
  debug: 'DBG',
  info:  'INF',
  warn:  'WRN',
  error: 'ERR',
};

/**
 * Выезжающая снизу панель логов.
 *
 * Показывает записи из logger, поддерживает:
 *   - фильтр по уровню (toggle-кнопки);
 *   - поиск по тексту;
 *   - раскрытие стека по клику;
 *   - автоскролл вниз, если пользователь был внизу.
 */
export class LogPanel {
  constructor(container) {
    this.container = container;
    this._filter = { debug: true, info: true, warn: true, error: true };
    this._query = '';
    this._lastVersion = null;
    this._wasAtBottom = true;

    this._build();

    this._unsubscribe = logger.onChange(() => this.refresh());
    this.refresh();
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
  }

  _build() {
    this.container.innerHTML = `
      <div class="log-header">
        <h3>Логи</h3>
        <input type="text" class="log-search" placeholder="Поиск…">
        <div class="log-filters">
          <button type="button" class="log-filter active" data-level="debug">Отладка</button>
          <button type="button" class="log-filter active" data-level="info">Инфо</button>
          <button type="button" class="log-filter active" data-level="warn">Предупр.</button>
          <button type="button" class="log-filter active" data-level="error">Ошибки</button>
        </div>
        <div class="log-actions">
          <button type="button" class="log-btn" data-action="clear" title="Очистить">
            ${icon('x')}<span>Очистить</span>
          </button>
          <button type="button" class="log-btn" data-action="close" title="Закрыть (F10)">
            ${icon('x')}
          </button>
        </div>
      </div>
      <div class="log-list"></div>
      <div class="log-footer"></div>
    `;

    this.listEl   = this.container.querySelector('.log-list');
    this.footerEl = this.container.querySelector('.log-footer');
    this.searchEl = this.container.querySelector('.log-search');

    this.searchEl.addEventListener('input', () => {
      this._query = this.searchEl.value.trim().toLowerCase();
      this._lastVersion = null;
      this.refresh();
    });

    this.container.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.log-filter');
      if (filterBtn) {
        const lvl = filterBtn.dataset.level;
        this._filter[lvl] = !this._filter[lvl];
        filterBtn.classList.toggle('active', this._filter[lvl]);
        this._lastVersion = null;
        this.refresh();
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const a = actionBtn.dataset.action;
        if (a === 'clear') logger.clear();
        else if (a === 'close') this.hide();
        return;
      }

      const row = e.target.closest('.log-row');
      if (row && row.dataset.hasStack === '1') {
        row.classList.toggle('expanded');
      }
    });

    this.listEl.addEventListener('scroll', () => {
      const el = this.listEl;
      this._wasAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    });
  }

  show() {
    this.container.hidden = false;
    this._lastVersion = null;
    this.refresh();
    requestAnimationFrame(() => {
      this.listEl.scrollTop = this.listEl.scrollHeight;
      this._wasAtBottom = true;
    });
  }

  hide() {
    this.container.hidden = true;
  }

  toggle() {
    if (this.container.hidden) this.show();
    else this.hide();
  }

  get isVisible() {
    return !this.container.hidden;
  }

  refresh() {
    // Простейшая версия: длина + id последней записи.
    const last = logger.entries[logger.entries.length - 1];
    const version = logger.entries.length + ':' + (last ? last.id : 0);
    if (version === this._lastVersion) return;
    this._lastVersion = version;
    this._render();
  }

  _render() {
    const entries = this._filtered();
    const wasAtBottom = this._wasAtBottom !== false;

    this.listEl.innerHTML = '';
    for (const e of entries) {
      this.listEl.appendChild(this._renderRow(e));
    }

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = logger.entries.length === 0
        ? 'Логов пока нет.'
        : 'Ничего не найдено по фильтру.';
      this.listEl.appendChild(empty);
    }

    const total  = logger.entries.length;
    const errors = logger.entries.filter((e) => e.level === 'error').length;
    const warns  = logger.entries.filter((e) => e.level === 'warn').length;
    this.footerEl.textContent =
      `Всего: ${total} · Показано: ${entries.length} · ` +
      `Ошибок: ${errors} · Предупреждений: ${warns}`;

    if (wasAtBottom) {
      requestAnimationFrame(() => {
        this.listEl.scrollTop = this.listEl.scrollHeight;
      });
    }
  }

  _filtered() {
    const q = this._query;
    const f = this._filter;
    const out = [];
    for (const e of logger.entries) {
      if (!f[e.level]) continue;
      if (q && !e.message.toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out;
  }

  _renderRow(e) {
    const row = document.createElement('div');
    row.className = 'log-row log-' + e.level;
    if (e.stack) row.dataset.hasStack = '1';

    const t = new Date(e.ts);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    const ms = String(t.getMilliseconds()).padStart(3, '0');

    const messageEl = document.createElement('span');
    messageEl.className = 'log-message';
    messageEl.textContent = e.message;

    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = `${hh}:${mm}:${ss}.${ms}`;

    const levelEl = document.createElement('span');
    levelEl.className = 'log-level';
    levelEl.textContent = LEVEL_LABELS[e.level] || 'INF';

    row.append(timeEl, levelEl, messageEl);

    if (e.stack) {
      const stackEl = document.createElement('pre');
      stackEl.className = 'log-stack';
      stackEl.textContent = e.stack;
      row.appendChild(stackEl);
    }

    return row;
  }
}