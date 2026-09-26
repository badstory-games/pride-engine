import { icon } from './icons.js';

/**
 * Модалка настроек экспорта.
 *
 *   const opts = await exportModal.pick();
 *   if (!opts) return;
 *   // opts: { mode, minify, showSplash, debugOverlay, debugPhysics }
 *
 * Настройки сохраняются в localStorage — переживают перезагрузку вкладки.
 * Ключ версионирован.
 *
 * Каждый пункт — <label> вокруг <input>. Переключение полностью нативное.
 */

const STORAGE_KEY = 'pride.export.options.v1';

const DEFAULT_STATE = {
  mode: 'single',
  minify: false,
  showSplash: true,
  debugOverlay: true,
  debugPhysics: false,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE };

    const mode = parsed.mode === 'folder' ? 'folder' : 'single';
    return {
      mode,
      minify:       !!parsed.minify,
      showSplash:   parsed.showSplash !== false,
      debugOverlay: parsed.debugOverlay !== false,
      debugPhysics: !!parsed.debugPhysics,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export class ExportModal {
  constructor() {
    this._el = null;
    this._resolver = null;
    this._onKey = this._onKey.bind(this);
    this._bodyEl = null;
    this._noteEl = null;

    this._state = loadState();
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
    box.className = 'modal-box export-modal';

    const header = document.createElement('div');
    header.className = 'modal-box-header';
    header.innerHTML = `
      <h3>${icon('package')}<span>Экспорт игры</span></h3>
      <p class="export-hint">
        Соберём standalone-версию проекта. Итог открывается в браузере
        без сервера и работает офлайн.
      </p>
    `;
    box.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-box-body export-body';
    box.appendChild(body);
    this._bodyEl = body;

    // Формат
    body.appendChild(this._section('Формат'));
    body.appendChild(this._radioRow(
      'mode', 'single',
      'Один файл (game.html)',
      'Всё встроено: модули, ассеты. Один файл — легко отправить.'
    ));
    body.appendChild(this._radioRow(
      'mode', 'folder',
      'Папка (game.zip)',
      'Отдельные модули и PNG-файлы внутри архива. Удобно для отладки и правок.',
      'нужен сервер'
    ));

    // Опции сборки
    body.appendChild(this._section('Сборка'));
    body.appendChild(this._checkRow(
      'minify',
      'Сжать модули',
      'Убирает комментарии и пустые строки. На работу не влияет.'
    ));
    body.appendChild(this._checkRow(
      'showSplash',
      'Splash-экран при запуске',
      'Анимированный логотип, пока игра грузится. Исчезает через 0.8 сек.'
    ));

    // Отладка
    body.appendChild(this._section('Отладка'));
    body.appendChild(this._checkRow(
      'debugOverlay',
      'Показывать FPS в игре',
      'Счётчик кадров в левом верхнем углу экспортированной игры.'
    ));
    body.appendChild(this._checkRow(
      'debugPhysics',
      'Показывать контуры физики',
      'Debug draw: контуры тел и точки контактов. Обычно выключено.'
    ));

    // Предупреждение для folder
    this._noteEl = document.createElement('div');
    this._noteEl.className = 'export-note';
    this._noteEl.hidden = true;
    this._noteEl.innerHTML = `
      <span class="export-note-icon">${icon('alert')}</span>
      <div class="export-note-text">
        <strong>Нужен локальный сервер или публикация.</strong>
        Внутри архива — отдельные ES-модули. Открыть
        <code>index.html</code> двойным кликом из проводника не получится:
        браузер заблокирует загрузку модулей из-за ограничений
        протокола <code>file://</code>.<br>
        Запустите игру через локальный сервер —
        <code>python -m http.server</code>, <code>npx serve</code>,
        VS Code Live Server — или опубликуйте на хостинге
        (GitHub Pages, Netlify, Cloudflare Pages).
      </div>
    `;
    body.appendChild(this._noteEl);

    const footer = document.createElement('div');
    footer.className = 'modal-box-footer';
    footer.innerHTML = `
      <button type="button" class="modal-btn modal-btn-secondary" data-action="cancel">Отмена</button>
      <button type="button" class="modal-btn modal-btn-primary" data-action="ok">
        ${icon('download')}<span>Экспортировать</span>
      </button>
    `;
    box.appendChild(footer);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this._el = backdrop;

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this._close(null);
    });

    body.addEventListener('change', (e) => {
      const el = e.target;
      if (el.name === 'mode') {
        this._state.mode = el.value;
        this._updateNote();
      } else if (el.dataset.opt) {
        this._state[el.dataset.opt] = !!el.checked;
      }
      saveState(this._state);
    });

    footer.querySelector('[data-action="cancel"]')
      .addEventListener('click', () => this._close(null));
    footer.querySelector('[data-action="ok"]')
      .addEventListener('click', () => this._close({ ...this._state }));

    this._updateNote();

    requestAnimationFrame(() => {
      const okBtn = footer.querySelector('[data-action="ok"]');
      if (okBtn) okBtn.focus();
    });
  }

  _updateNote() {
    if (!this._noteEl) return;
    this._noteEl.hidden = this._state.mode !== 'folder';
  }

  _section(title) {
    const el = document.createElement('div');
    el.className = 'export-section';
    el.textContent = title;
    return el;
  }

  _radioRow(name, value, title, hint, badge = null) {
    const row = document.createElement('label');
    row.className = 'export-row export-row-radio';
    const checked = this._state[name] === value ? 'checked' : '';
    const badgeHtml = badge ? `<span class="export-badge">${badge}</span>` : '';
    row.innerHTML = `
      <input type="radio" name="${name}" value="${value}" ${checked}>
      <span class="export-radio-mark"></span>
      <span class="export-text">
        <span class="export-label">${title}${badgeHtml}</span>
        <span class="export-hint-line">${hint}</span>
      </span>
    `;
    return row;
  }

  _checkRow(opt, title, hint) {
    const row = document.createElement('label');
    row.className = 'export-row export-row-check';
    const checked = this._state[opt] ? 'checked' : '';
    row.innerHTML = `
      <input type="checkbox" data-opt="${opt}" ${checked}>
      <span class="export-check-mark"></span>
      <span class="export-text">
        <span class="export-label">${title}</span>
        <span class="export-hint-line">${hint}</span>
      </span>
    `;
    return row;
  }

  _onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._close(null);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._close({ ...this._state });
    }
  }

  _close(result) {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._el.remove();
    this._el = null;
    this._bodyEl = null;
    this._noteEl = null;
    const r = this._resolver;
    this._resolver = null;
    if (r) r(result);
  }
}