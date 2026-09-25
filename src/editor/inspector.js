import { icon } from './icons.js';
import { optionLabel } from './options-i18n.js';

/** Отображаемые имена для системных текстур. Внутри id не меняется. */
const TEXTURE_LABELS = {
  '__white': 'По умолчанию',
};

function textureLabel(id) {
  return TEXTURE_LABELS[id] || id;
}

export class Inspector {
  constructor(container, editor, scene) {
    this.container = container;
    this.editor = editor;
    this.scene = scene;
    this.fields = {};
    this.textures = [];

    this._layersSig = '';
    this._texturesSig = '';
    this._instVarsSig = '';

    /** Колбэки, устанавливаемые извне (main.js). */
    this.onObjectRenamed   = null;   // (oldName, newName) => void
    this.onInstVarRenamed  = null;   // (objName, oldName, newName) => void

    // Запоминается в focusin для поля «Имя» — используется в blur.
    this._nameOriginal = null;

    this._build();
    this.container.addEventListener('input', (e) => this._onFieldChange(e));
    this.container.addEventListener('click', (e) => this._onFormClick(e));
    this.container.addEventListener('focusin', (e) => this._onFormFocusIn(e));
    this.container.addEventListener('blur', (e) => this._onFormBlur(e), true);
    this.container.addEventListener('keydown', (e) => this._onFormKeydown(e));
  }

  setTextures(list) {
    this.textures = list;
    this._texturesSig = '';
  }

  _build() {
    this.container.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.innerHTML = `
      <div class="inspector-empty-icon">▢</div>
      <div class="inspector-empty-title">Объект не выбран</div>
      <div class="inspector-empty-hint">
        Выберите объект на сцене, чтобы<br>увидеть и изменить его свойства.
      </div>
    `;
    this.container.appendChild(empty);
    this.emptyEl = empty;

    const form = document.createElement('div');
    form.className = 'inspector-form';
    this.container.appendChild(form);
    this.formEl = form;

    // ---------- Основное ----------
    this._textField(form, 'name', 'Имя');
    this._numField(form, 'x',        'X');
    this._numField(form, 'y',        'Y');
    this._numField(form, 'width',    'Ширина',  { min: 1, step: 1 });
    this._numField(form, 'height',   'Высота',  { min: 1, step: 1 });
    this._numField(form, 'rotationDeg', 'Поворот°', { step: 1 });
    this._numField(form, 'opacity',  'Прозрачность', { min: 0, max: 1, step: 0.05 });
    this._selectField(form, 'layerId', 'Слой');
    this._selectField(form, 'textureId', 'Текстура');

    const idRow = document.createElement('div');
    idRow.className = 'inspector-row';
    idRow.innerHTML = `<label>ID</label><input type="text" data-prop="id" readonly>`;
    form.appendChild(idRow);
    this.fields.id = idRow.querySelector('input');

    const visRow = document.createElement('div');
    visRow.className = 'inspector-row inspector-row-check';
    visRow.innerHTML = `<label><input type="checkbox" data-prop="visible"> Видимый</label>`;
    form.appendChild(visRow);
    this.fields.visible = visRow.querySelector('input');

    // ---------- Физика ----------
    const physTitle = document.createElement('div');
    physTitle.className = 'inspector-section-title';
    physTitle.textContent = 'Физика';
    form.appendChild(physTitle);

    const enRow = document.createElement('div');
    enRow.className = 'inspector-row inspector-row-check';
    enRow.innerHTML = `<label><input type="checkbox" data-prop="physEnabled"> Включить физику</label>`;
    form.appendChild(enRow);
    this.fields.physEnabled = enRow.querySelector('input');

    this._selectField(form, 'physType',   'Тип тела');
    this._selectField(form, 'physShape',  'Форма');
    this._numField   (form, 'physDensity',     'Плотность',  { min: 0, step: 0.1 });
    this._numField   (form, 'physFriction',    'Трение',     { min: 0, max: 1, step: 0.05 });
    this._numField   (form, 'physRestitution', 'Упругость',  { min: 0, max: 1, step: 0.05 });
    this._numField   (form, 'physRadius',      'Радиус',     { min: 1, step: 1 });

    // Значения остаются английскими, метки берутся из OPTION_LABELS.
    const fillSelect = (sel, values) => {
      sel.innerHTML = '';
      for (const v of values) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = optionLabel(v);
        sel.appendChild(o);
      }
    };
    fillSelect(this.fields.physType,  ['static', 'dynamic', 'kinematic']);
    fillSelect(this.fields.physShape, ['box', 'circle']);

    this._physNumericFields = [
      'physDensity', 'physFriction', 'physRestitution', 'physRadius',
    ];

    // ---------- Переменные объекта ----------
    const instTitle = document.createElement('div');
    instTitle.className = 'inspector-section-title';
    instTitle.textContent = 'Переменные объекта';
    form.appendChild(instTitle);

    const instWrap = document.createElement('div');
    instWrap.className = 'inspector-instvars';
    form.appendChild(instWrap);
    this._instVarsEl = instWrap;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'topbtn inspector-instvar-add';
    addBtn.innerHTML = `${icon('plus')}<span>Добавить переменную</span>`;
    addBtn.dataset.action = 'instvar-add';
    form.appendChild(addBtn);
  }

  _textField(parent, prop, label) {
    const row = document.createElement('div');
    row.className = 'inspector-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.prop = prop;
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    parent.appendChild(row);
    this.fields[prop] = input;
  }

  _numField(parent, prop, label, opts = {}) {
    const row = document.createElement('div');
    row.className = 'inspector-row';
    const input = document.createElement('input');
    input.type = 'number';
    input.dataset.prop = prop;
    if (opts.min  !== undefined) input.min  = opts.min;
    if (opts.max  !== undefined) input.max  = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    parent.appendChild(row);
    this.fields[prop] = input;
  }

  _selectField(parent, prop, label) {
    const row = document.createElement('div');
    row.className = 'inspector-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.dataset.prop = prop;
    row.appendChild(lbl);
    row.appendChild(sel);
    parent.appendChild(row);
    this.fields[prop] = sel;
  }

  _ensureLayerOptions() {
    const sig = this.scene.layers.map((l) => `${l.id}:${l.name}`).join('|');
    if (sig === this._layersSig) return;
    this._layersSig = sig;

    const sel = this.fields.layerId;
    const prev = sel.value;
    sel.innerHTML = '';
    for (const l of this.scene.layers) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  _ensureTextureOptions() {
    const sig = this.textures.join('|');
    if (sig === this._texturesSig) return;
    this._texturesSig = sig;

    const sel = this.fields.textureId;
    const prev = sel.value;
    sel.innerHTML = '';

    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— none —';
    sel.appendChild(none);

    for (const t of this.textures) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = textureLabel(t);
      sel.appendChild(opt);
    }

    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  refresh() {
    const sel = [...this.editor.selection];
    if (sel.length === 0) {
      this.emptyEl.hidden = false;
      this.formEl.hidden = true;
      this._instVarsSig = '';
      return;
    }

    this.emptyEl.hidden = true;
    this.formEl.hidden = false;

    const first = this.scene.get(sel[0]);
    if (!first) return;

    this._ensureLayerOptions();
    this._ensureTextureOptions();

    const activeProp = document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.prop : null;

    const setVal = (prop, v) => {
      if (prop === activeProp) return;
      this.fields[prop].value = v;
    };

    setVal('name', first.name || 'Object');
    setVal('id', first.id);
    setVal('x', first.x.toFixed(2));
    setVal('y', first.y.toFixed(2));
    setVal('width', first.width);
    setVal('height', first.height);
    setVal('rotationDeg', (first.rotation * 180 / Math.PI).toFixed(2));
    setVal('opacity', first.opacity);
    setVal('layerId', first.layerId);
    setVal('textureId', first.textureId || '');
    this.fields.visible.checked = first.visible;

    const ph = first.physics || {};
    const setVal2 = (prop, v) => {
      if (prop === activeProp) return;
      this.fields[prop].value = v;
    };

    this.fields.physEnabled.checked = !!ph.enabled;
    setVal2('physType',        ph.type        || 'dynamic');
    setVal2('physShape',       ph.shape       || 'box');
    setVal2('physDensity',     ph.density     ?? 1);
    setVal2('physFriction',    ph.friction    ?? 0.5);
    setVal2('physRestitution', ph.restitution ?? 0.2);
    setVal2('physRadius',      ph.radius      ?? 32);

    const radiusRow = this.fields.physRadius.closest('.inspector-row');
    if (radiusRow) radiusRow.style.display = (ph.shape === 'circle') ? '' : 'none';

    const disabled = !ph.enabled;
    for (const p of this._physNumericFields) {
      this.fields[p].disabled = disabled;
    }
    this.fields.physRadius.disabled = disabled || ph.shape !== 'circle';

    this._renderInstanceVars();
  }

  // ============================================================
  // Instance variables — рендеринг
  // ============================================================

  _renderInstanceVars() {
    const sel = [...this.editor.selection];
    if (sel.length === 0) {
      this._instVarsEl.innerHTML = '';
      this._instVarsSig = '';
      return;
    }

    const first = this.scene.get(sel[0]);
    if (!first) return;
    const props = first.properties || {};
    const names = Object.keys(props);

    const sig = names.join('|') + '#' + sel.length;

    const active = document.activeElement;
    const editingInstVar = active
      && this._instVarsEl.contains(active)
      && (active.classList.contains('instvar-name')
       || active.classList.contains('instvar-value'));

    if (sig === this._instVarsSig || editingInstVar) {
      this._updateInstanceVarValues();
      return;
    }
    this._instVarsSig = sig;

    const c = this._instVarsEl;
    c.innerHTML = '';

    if (names.length === 0) {
      const e = document.createElement('div');
      e.className = 'inspector-instvars-empty';
      e.textContent = 'Нет переменных.';
      c.appendChild(e);
      return;
    }

    for (const name of names) {
      const row = document.createElement('div');
      row.className = 'inspector-instvar-row';
      row.dataset.instVarName = name;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'instvar-name';
      nameInput.value = name;
      nameInput.dataset.instVarField = 'name';
      nameInput.placeholder = 'Имя';

      const valueInput = document.createElement('input');
      valueInput.type = 'number';
      valueInput.className = 'instvar-value';
      valueInput.value = props[name] ?? 0;
      valueInput.step = 'any';
      valueInput.dataset.instVarField = 'value';

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'instvar-del';
      del.title = 'Удалить';
      del.innerHTML = icon('x');
      del.dataset.instVarField = 'delete';

      row.append(nameInput, valueInput, del);
      c.appendChild(row);
    }
  }

  _updateInstanceVarValues() {
    const first = this.scene.get([...this.editor.selection][0]);
    if (!first) return;
    const props = first.properties || {};

    for (const row of this._instVarsEl.querySelectorAll('.inspector-instvar-row')) {
      const name = row.dataset.instVarName;
      const valueInput = row.querySelector('input.instvar-value');
      if (!valueInput) continue;
      if (document.activeElement === valueInput) continue;
      const v = props[name] ?? 0;
      if (valueInput.value !== String(v)) valueInput.value = v;
    }
  }

  // ============================================================
  // Form events
  // ============================================================

  _onFormClick(e) {
    const del = e.target.closest('.instvar-del');
    if (del) {
      const row = del.closest('.inspector-instvar-row');
      if (!row) return;
      const name = row.dataset.instVarName;

      const h = this.editor.history;
      const apply = () => {
        for (const id of this.editor.selection) {
          const obj = this.scene.get(id);
          if (!obj || !obj.properties) continue;
          delete obj.properties[name];
        }
      };
      if (h) h.run('Delete inst var', apply); else apply();

      this._instVarsSig = '';
      this.refresh();
      this.editor.onChange();
      return;
    }

    if (e.target.closest('[data-action="instvar-add"]')) {
      this._addInstanceVar();
    }
  }

  _addInstanceVar() {
    if (this.editor.selection.size === 0) return;

    const h = this.editor.history;
    const apply = () => {
      for (const id of this.editor.selection) {
        const obj = this.scene.get(id);
        if (!obj) continue;
        obj.properties = obj.properties || {};
        let n = 1;
        while (obj.properties['var' + n] !== undefined) n++;
        obj.properties['var' + n] = 0;
      }
    };
    if (h) h.run('Add inst var', apply); else apply();

    this._instVarsSig = '';
    this.refresh();
    this.editor.onChange();
  }

  // ---------- focus / blur / Enter ----------

  _onFormFocusIn(e) {
    const input = e.target;
    if (!input || !input.classList) return;

    if (input.classList.contains('instvar-name')) {
      const row = input.closest('.inspector-instvar-row');
      if (!row) return;
      input.dataset.originalName = row.dataset.instVarName;
      input.classList.remove('instvar-name-invalid');
      return;
    }

    const prop = input.dataset && input.dataset.prop;
    if (!prop || input.readOnly || input.type === 'checkbox') return;
    if (this.editor.selection.size === 0) return;

    if (prop === 'name') {
      const first = this.scene.get([...this.editor.selection][0]);
      this._nameOriginal = first ? (first.name || 'Object') : null;
    }

    const h = this.editor.history;
    if (h) h.begin('Inspector: ' + prop);
  }

  _onFormKeydown(e) {
    if (e.key !== 'Enter') return;
    const input = e.target;
    if (!input || !input.classList) return;

    // instvar: name / value
    if (input.classList.contains('instvar-name') ||
        input.classList.contains('instvar-value')) {
      e.preventDefault();
      input.blur();
      return;
    }

    // Обычные поля инспектора с data-prop: текст, number, select.
    // Enter → commit через blur. Checkbox и readonly не трогаем.
    const prop = input.dataset && input.dataset.prop;
    if (prop && !input.readOnly && input.type !== 'checkbox') {
      e.preventDefault();
      input.blur();
    }
  }

  _onFormBlur(e) {
    const input = e.target;
    if (!input || !input.classList) return;

    if (input.classList.contains('instvar-name')) {
      this._commitInstVarName(input);
      return;
    }

    if (input.classList.contains('instvar-value')) {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) {
        const row = input.closest('.inspector-instvar-row');
        if (row) {
          const first = this.scene.get([...this.editor.selection][0]);
          const name = row.dataset.instVarName;
          const props = (first && first.properties) || {};
          input.value = props[name] ?? 0;
        }
      }
      return;
    }

    const prop = input.dataset && input.dataset.prop;
    if (!prop) return;
    const h = this.editor.history;
    if (h) h.commit();

    if (prop === 'name') {
      const oldName = this._nameOriginal;
      this._nameOriginal = null;
      const first = this.scene.get([...this.editor.selection][0]);
      const newName = first ? (first.name || 'Object') : null;
      if (oldName && newName && oldName !== newName && this.onObjectRenamed) {
        this.onObjectRenamed(oldName, newName);
      }
    }
  }

  _commitInstVarName(input) {
    const row = input.closest('.inspector-instvar-row');
    if (!row) return;

    const originalName = input.dataset.originalName || row.dataset.instVarName;
    const newName = (input.value || '').trim();

    if (!newName || newName === originalName) {
      input.value = originalName;
      input.classList.remove('instvar-name-invalid');
      return;
    }

    const first = this.scene.get([...this.editor.selection][0]);
    if (first && first.properties && first.properties[newName] !== undefined) {
      input.value = originalName;
      input.classList.add('instvar-name-invalid');
      setTimeout(() => input.classList.remove('instvar-name-invalid'), 1200);
      return;
    }

    const h = this.editor.history;
    const apply = () => {
      for (const id of this.editor.selection) {
        const obj = this.scene.get(id);
        if (!obj || !obj.properties) continue;
        if (obj.properties[originalName] === undefined) continue;
        obj.properties[newName] = obj.properties[originalName];
        delete obj.properties[originalName];
      }
    };
    if (h) h.run('Rename inst var', apply); else apply();

    row.dataset.instVarName = newName;
    input.dataset.originalName = newName;
    input.classList.remove('instvar-name-invalid');

    if (this.onInstVarRenamed) {
      const first = this.scene.get([...this.editor.selection][0]);
      const objName = first ? first.name : null;
      if (objName) this.onInstVarRenamed(objName, originalName, newName);
    }

    this._refreshInstVarsSigQuietly();
    this.editor.onChange();
  }

  _onFieldChange(e) {
    const instField = e.target.dataset && e.target.dataset.instVarField;
    if (instField && instField !== 'delete') {
      this._onInstVarChange(e);
      return;
    }

    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;

    const isCheckbox = e.target.type === 'checkbox';
    const value = isCheckbox ? e.target.checked : e.target.value;

    const apply = () => {
      for (const id of this.editor.selection) {
        const obj = this.scene.get(id);
        if (!obj) continue;

        switch (prop) {
          case 'name':
            obj.name = String(value) || 'Объект';
            break;
          case 'x':
          case 'y':
          case 'width':
          case 'height': {
            const n = parseFloat(value);
            if (Number.isFinite(n)) obj[prop] = n;
            break;
          }
          case 'rotationDeg': {
            const deg = parseFloat(value);
            if (Number.isFinite(deg)) obj.rotation = deg * Math.PI / 180;
            break;
          }
          case 'opacity': {
            const n = parseFloat(value);
            if (Number.isFinite(n)) obj.opacity = Math.min(1, Math.max(0, n));
            break;
          }
          case 'layerId':
            obj.layerId = value;
            break;
          case 'textureId':
            obj.textureId = value || null;
            break;
          case 'physEnabled':
            obj.physics = obj.physics || {};
            obj.physics.enabled = value;
            break;
          case 'physType':
            obj.physics = obj.physics || {};
            obj.physics.type = value;
            break;
          case 'physShape':
            obj.physics = obj.physics || {};
            obj.physics.shape = value;
            break;
          case 'physDensity':
          case 'physFriction':
          case 'physRestitution':
          case 'physRadius': {
            const key = prop.replace('phys', '').toLowerCase();
            const n = parseFloat(value);
            if (Number.isFinite(n)) {
              obj.physics = obj.physics || {};
              obj.physics[key] = n;
            }
            break;
          }
          case 'visible':
            obj.visible = value;
            break;
        }
      }
      this.editor.onChange();
    };

    if (isCheckbox) {
      const h = this.editor.history;
      if (h) h.run('Inspector: ' + prop, apply); else apply();
    } else {
      apply();
    }
  }

  _onInstVarChange(e) {
    const field = e.target.dataset.instVarField;
    const row = e.target.closest('.inspector-instvar-row');
    if (!row) return;

    if (field === 'name') {
      const originalName = e.target.dataset.originalName || row.dataset.instVarName;
      const newName = (e.target.value || '').trim();
      const first = this.scene.get([...this.editor.selection][0]);

      const invalid = !!newName
        && newName !== originalName
        && first && first.properties
        && first.properties[newName] !== undefined;

      e.target.classList.toggle('instvar-name-invalid', invalid);
      return;
    }

    if (field === 'value') {
      const name = row.dataset.instVarName;
      const n = parseFloat(e.target.value);
      if (!Number.isFinite(n)) return;

      const h = this.editor.history;
      const apply = () => {
        for (const id of this.editor.selection) {
          const obj = this.scene.get(id);
          if (!obj) continue;
          obj.properties = obj.properties || {};
          obj.properties[name] = n;
        }
      };
      if (h) h.run('Set inst var', apply); else apply();
      this.editor.onChange();
    }
  }

  _refreshInstVarsSigQuietly() {
    const sel = [...this.editor.selection];
    if (sel.length === 0) { this._instVarsSig = ''; return; }
    const first = this.scene.get(sel[0]);
    if (!first) return;
    const names = Object.keys(first.properties || {});
    this._instVarsSig = names.join('|') + '#' + sel.length;
  }
}