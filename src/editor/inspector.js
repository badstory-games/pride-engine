export class Inspector {
  constructor(container, editor, scene) {
    this.container = container;
    this.editor = editor;
    this.scene = scene;
    this.fields = {};
    this.textures = [];

    this._layersSig = '';      // подпись текущего состава слоёв
    this._texturesSig = '';    // подпись текущего состава текстур

    this._build();
    this.container.addEventListener('input', (e) => this._onFieldChange(e));
  }

  setTextures(list) {
    this.textures = list;
    // форсируем пересборку опций текстур на следующем refresh
    this._texturesSig = '';
  }

  _build() {
    this.container.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = 'No selection';
    this.container.appendChild(empty);
    this.emptyEl = empty;

    const form = document.createElement('div');
    form.className = 'inspector-form';
    this.container.appendChild(form);
    this.formEl = form;

    this._numField(form, 'x',        'X');
    this._numField(form, 'y',        'Y');
    this._numField(form, 'width',    'Width',  { min: 1, step: 1 });
    this._numField(form, 'height',   'Height', { min: 1, step: 1 });
    this._numField(form, 'rotationDeg', 'Rotation°', { step: 1 });
    this._numField(form, 'opacity',  'Opacity', { min: 0, max: 1, step: 0.05 });

    this._selectField(form, 'layerId', 'Layer');
    this._selectField(form, 'textureId', 'Texture');

    const row = document.createElement('div');
    row.className = 'inspector-row';
    row.innerHTML = `<label>ID</label><input type="text" data-prop="id" readonly>`;
    form.appendChild(row);
    this.fields.id = row.querySelector('input');

    const visRow = document.createElement('div');
    visRow.className = 'inspector-row inspector-row-check';
    visRow.innerHTML = `<label><input type="checkbox" data-prop="visible"> Visible</label>`;
    form.appendChild(visRow);
    this.fields.visible = visRow.querySelector('input');
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
      opt.textContent = t;
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  refresh() {
    const sel = [...this.editor.selection];
    if (sel.length === 0) {
      this.emptyEl.hidden = false;
      this.formEl.hidden = true;
      return;
    }

    this.emptyEl.hidden = true;
    this.formEl.hidden = false;

    const first = this.scene.get(sel[0]);
    if (!first) return;

    // Опции пересобираются только при изменении состава, не на каждый refresh.
    this._ensureLayerOptions();
    this._ensureTextureOptions();

    const activeProp = document.activeElement && document.activeElement.dataset
      ? document.activeElement.dataset.prop : null;

    const setVal = (prop, v) => {
      if (prop === activeProp) return;
      this.fields[prop].value = v;
    };

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
  }

  _onFieldChange(e) {
    const prop = e.target.dataset && e.target.dataset.prop;
    if (!prop) return;

    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

    for (const id of this.editor.selection) {
      const obj = this.scene.get(id);
      if (!obj) continue;

      switch (prop) {
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
        case 'visible':
          obj.visible = value;
          break;
      }
    }

    this.editor.onChange();
  }
}