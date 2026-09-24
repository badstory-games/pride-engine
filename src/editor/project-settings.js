import { hintsEnabled, setHintsEnabled } from './hints.js';

/**
 * Панель настроек проекта.
 *
 * Поля:
 *   - Имя проекта (строка, метаданные)
 *   - Размер канваса (ширина, высота) → применяется к <canvas>
 *   - Цвет фона → clearValue в renderer
 *   - Гравитация X, Y → PhysicsBridge.setGravity
 *   - Чекбокс «Показывать подсказки» — глобальная настройка пользователя,
 *     не часть проекта, хранится в localStorage.
 *
 * Все изменения проекта проходят через history:
 *   - текстовые/number — транзакция от focus до blur;
 *   - color — snapshot на change.
 * Чекбокс подсказок — отдельно, без history.
 */
export class ProjectSettings {
  constructor(container, project, opts = {}) {
    this.container = container;
    this.project = project;
    this.onChange = () => {};
    this.history = null;

    this.onCanvasSizeChange      = opts.onCanvasSizeChange      || (() => {});
    this.onGravityChange         = opts.onGravityChange         || (() => {});
    this.onBgColorChange         = opts.onBgColorChange         || (() => {});
    this.onNameChange            = opts.onNameChange            || (() => {});
    this.onHintsEnabledChange    = opts.onHintsEnabledChange    || (() => {});

    this.fields = {};
    this._build();
  }

  _build() {
    this.container.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'ps-form';

    this._section(form, 'Общие');
    this._textField(form, 'name', 'Имя проекта');

    this._section(form, 'Канвас');
    this._numField(form, 'canvasWidth',  'Ширина',    { min: 64, step: 1 });
    this._numField(form, 'canvasHeight', 'Высота',    { min: 64, step: 1 });
    this._colorField(form, 'bgColor', 'Цвет фона');

    this._section(form, 'Физика');
    this._numField(form, 'gravityX', 'Гравитация X', { step: 10 });
    this._numField(form, 'gravityY', 'Гравитация Y', { step: 10 });

    this._section(form, 'Помощь');
    this._checkField(form, 'hintsEnabled', 'Показывать подсказки');

    this.container.appendChild(form);

    this.container.addEventListener('input',   (e) => this._onInput(e));
    this.container.addEventListener('change',  (e) => this._onChange(e));
    this.container.addEventListener('focusin', (e) => this._onFocusIn(e));
    this.container.addEventListener('blur',    (e) => this._onBlur(e), true);

    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const t = e.target;
        if (t && t.matches && t.matches('input')) { e.preventDefault(); t.blur(); }
      }
    });
  }

  _section(parent, title) {
    const el = document.createElement('div');
    el.className = 'ps-section';
    el.textContent = title;
    parent.appendChild(el);
  }

  _textField(parent, prop, label) {
    const row = document.createElement('div');
    row.className = 'ps-row';
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = 'text';
    i.dataset.prop = prop;
    row.append(l, i);
    parent.appendChild(row);
    this.fields[prop] = i;
  }

  _numField(parent, prop, label, opts = {}) {
    const row = document.createElement('div');
    row.className = 'ps-row';
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = 'number';
    i.dataset.prop = prop;
    if (opts.min  !== undefined) i.min  = opts.min;
    if (opts.max  !== undefined) i.max  = opts.max;
    if (opts.step !== undefined) i.step = opts.step;
    row.append(l, i);
    parent.appendChild(row);
    this.fields[prop] = i;
  }

  _colorField(parent, prop, label) {
    const row = document.createElement('div');
    row.className = 'ps-row';
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = 'color';
    i.dataset.prop = prop;
    row.append(l, i);
    parent.appendChild(row);
    this.fields[prop] = i;
  }

  _checkField(parent, prop, label) {
    const row = document.createElement('div');
    row.className = 'ps-row ps-row-check';
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-prop="${prop}"> <span>${label}</span>`;
    row.appendChild(l);
    parent.appendChild(row);
    this.fields[prop] = row.querySelector('input');
  }

  refresh() {
    const p = this.project;
    const active = document.activeElement;
    const activeProp = active && active.dataset ? active.dataset.prop : null;

    const set = (prop, v) => {
      if (prop === activeProp) return;
      this.fields[prop].value = v;
    };

    set('name',         p.name || 'Pride Project');
    set('canvasWidth',  p.canvasWidth  ?? 1024);
    set('canvasHeight', p.canvasHeight ?? 640);
    set('bgColor',      p.bgColor || '#333333');
    set('gravityX',     p.gravityX ?? 0);
    set('gravityY',     p.gravityY ?? 980);

    // Подсказки — глобальная настройка, читается из localStorage.
    if (activeProp !== 'hintsEnabled') {
      this.fields.hintsEnabled.checked = hintsEnabled();
    }
  }

  // ============================================================
  // events
  // ============================================================

  _onFocusIn(e) {
    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;
    if (e.target.type === 'color') return;
    if (e.target.type === 'checkbox') return;   // глобальная настройка, без истории
    const h = this.history;
    if (h) h.begin('Project: ' + prop);
  }

  _onBlur(e) {
    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;
    if (e.target.type === 'color') return;
    if (e.target.type === 'checkbox') return;
    const h = this.history;
    if (h) h.commit();
  }

  _onInput(e) {
    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;

    // Подсказки — глобальная настройка, не пишется в project и историю.
    if (prop === 'hintsEnabled') {
      const enabled = !!e.target.checked;
      setHintsEnabled(enabled);
      this.onHintsEnabledChange(enabled);
      return;
    }

    this._apply(prop, e.target.value);
  }

  _onChange(e) {
    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;
    if (e.target.type === 'color') {
      const h = this.history;
      if (h) h.snapshot('Project: bgColor');
      this.onChange();
    }
  }

  _apply(prop, rawValue) {
    const p = this.project;

    switch (prop) {
      case 'name': {
        const v = String(rawValue || '').trim() || 'Pride Project';
        if (p.name === v) return;
        p.name = v;
        this.onNameChange(v);
        break;
      }
      case 'canvasWidth':
      case 'canvasHeight': {
        const n = Math.floor(parseFloat(rawValue));
        if (!Number.isFinite(n) || n < 64) return;
        if (p[prop] === n) return;
        p[prop] = n;
        this.onCanvasSizeChange(
          p.canvasWidth  ?? 1024,
          p.canvasHeight ?? 640
        );
        break;
      }
      case 'bgColor': {
        const v = String(rawValue || '');
        if (!/^#[0-9a-f]{6}$/i.test(v)) return;
        if (p.bgColor === v) return;
        p.bgColor = v;
        this.onBgColorChange(v);
        break;
      }
      case 'gravityX':
      case 'gravityY': {
        const n = parseFloat(rawValue);
        if (!Number.isFinite(n)) return;
        if (p[prop] === n) return;
        p[prop] = n;
        this.onGravityChange(p.gravityX ?? 0, p.gravityY ?? 980);
        break;
      }
    }

    this.onChange();
  }
}