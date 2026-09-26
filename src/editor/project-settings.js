import { hintsEnabled, setHintsEnabled } from './hints.js';
import { projectIconHtml } from './project-icons.js';

/**
 * Панель настроек проекта.
 *
 * Поля:
 *   - Имя проекта
 *   - Иконка проекта (превью + кнопки «Сменить» / «Сбросить»)
 *   - Размер канваса
 *   - Цвет фона
 *   - Гравитация X / Y
 *   - Чекбокс «Показывать подсказки» — глобальная настройка
 *
 * Смена иконки делегируется наружу через onRequestIconPick.
 */
export class ProjectSettings {
  constructor(container, project, opts = {}) {
    this.container = container;
    this.project = project;
    this.onChange = () => {};
    this.history = null;

    this.onCanvasSizeChange   = opts.onCanvasSizeChange   || (() => {});
    this.onGravityChange      = opts.onGravityChange      || (() => {});
    this.onBgColorChange      = opts.onBgColorChange      || (() => {});
    this.onNameChange         = opts.onNameChange         || (() => {});
    this.onHintsEnabledChange = opts.onHintsEnabledChange || (() => {});

    /** @type {(() => Promise<void>)|null} */
    this.onRequestIconPick = null;

    this.fields = {};
    this._iconPreviewEl = null;
    this._iconResetBtn = null;

    this._build();
  }

  _build() {
    this.container.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'ps-form';

    this._section(form, 'Общие');
    this._textField(form, 'name', 'Имя проекта');
    this._iconField(form);

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
    this.container.addEventListener('blur',    (e) => this._onBlur(e), true);
    this.container.addEventListener('click',   (e) => this._onClick(e));

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

  _iconField(parent) {
    const row = document.createElement('div');
    row.className = 'ps-icon-field';

    const lbl = document.createElement('div');
    lbl.className = 'ps-icon-field-label';
    lbl.textContent = 'Иконка';
    row.appendChild(lbl);

    const inner = document.createElement('div');
    inner.className = 'ps-icon-row';

    const preview = document.createElement('div');
    preview.className = 'ps-icon-preview';
    preview.dataset.iconPreview = '1';
    inner.appendChild(preview);
    this._iconPreviewEl = preview;

    const actions = document.createElement('div');
    actions.className = 'ps-icon-actions';

    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'topbtn';
    changeBtn.dataset.action = 'icon-change';
    changeBtn.innerHTML = '<span>Сменить…</span>';
    actions.appendChild(changeBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'topbtn';
    resetBtn.dataset.action = 'icon-reset';
    resetBtn.innerHTML = '<span>Сбросить</span>';
    actions.appendChild(resetBtn);
    this._iconResetBtn = resetBtn;

    inner.appendChild(actions);
    row.appendChild(inner);

    parent.appendChild(row);
    this._syncIconPreview();
  }

  _syncIconPreview() {
    if (!this._iconPreviewEl) return;

    const dataUrl = this.project ? this.project.icon : null;
    this._iconPreviewEl.innerHTML = projectIconHtml(dataUrl);

    if (this._iconResetBtn) {
      const hasCustom = typeof dataUrl === 'string' && dataUrl.startsWith('data:');
      this._iconResetBtn.disabled = !hasCustom;
      this._iconResetBtn.title = hasCustom
        ? 'Вернуть стандартную иконку'
        : 'Иконка уже стандартная';
    }
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

    if (activeProp !== 'hintsEnabled') {
      this.fields.hintsEnabled.checked = hintsEnabled();
    }

    this._syncIconPreview();
  }

  // ============================================================
  // events
  // ============================================================

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'icon-change') {
      if (this.onRequestIconPick) this.onRequestIconPick();
      return;
    }
    if (action === 'icon-reset') {
      const hasCustom = typeof this.project.icon === 'string'
        && this.project.icon.startsWith('data:');
      if (!hasCustom) return;

      const h = this.history;
      const apply = () => { this.project.icon = null; };
      if (h) h.run('Project: icon', apply); else apply();

      this._syncIconPreview();
      this.onChange();
    }
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

    if (prop === 'hintsEnabled') {
      const enabled = !!e.target.checked;
      setHintsEnabled(enabled);
      this.onHintsEnabledChange(enabled);
      return;
    }

    if (e.target.type === 'color') {
      this._apply(prop, e.target.value);
      return;
    }

    const h = this.history;
    if (h) h.begin('Project: ' + prop);

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