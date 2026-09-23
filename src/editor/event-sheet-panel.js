import { registry } from '../engine/events/registry.js';

const KEY_OPTIONS = [
  'Space', 'Enter', 'Escape', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyJ', 'KeyK', 'KeyL',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
];

export class EventSheetPanel {
  constructor(container, project, eventRuntime, scene) {
    this.container = container;
    this.project = project;
    this.runtime = eventRuntime;
    this.scene = scene;
    this.onChange = () => {};

    container.innerHTML = `
      <div class="es-toolbar">
        <h3>Event Sheet</h3>
        <div class="es-toolbar-actions">
          <button class="topbtn" data-action="add-event">+ Add Event</button>
        </div>
      </div>
      <div class="es-list"></div>
    `;
    this.listEl = container.querySelector('.es-list');

    container.addEventListener('click',  (e) => this._onClick(e));
    container.addEventListener('input',  (e) => this._onInput(e));
    container.addEventListener('change', (e) => this._onChangeEl(e));
    this._attachDnD();
  }

  setSheet(sheet) {
    this.project.sheet = sheet;
    this.refresh();
  }

  refresh() {
    this._render();
  }

  _getSheet() { return this.project.sheet; }

  // ============================================================
  // RENDER
  // ============================================================

  _render() {
    const sheet = this._getSheet();
    if (!sheet || !sheet.events.length) {
      this.listEl.innerHTML =
        '<div class="es-empty">Нет событий. Перетащи условие из палитры или нажми «+ Add Event».</div>';
      return;
    }
    this.listEl.innerHTML = '';
    for (const ev of sheet.events) this.listEl.appendChild(this._renderEvent(ev, 0));
  }

  _renderEvent(event, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'es-event';
    wrap.dataset.eventId = event.id;
    wrap.style.marginLeft = (depth * 24) + 'px';
    wrap.draggable = true;

    const head = document.createElement('div');
    head.className = 'es-head';
    head.innerHTML = `
      <span class="es-event-id">#${event.id}</span>
      <div class="es-head-actions">
        <button class="es-mini" data-action="add-condition" title="Добавить условие">+ if</button>
        <button class="es-mini" data-action="add-action"    title="Добавить действие">+ do</button>
        <button class="es-mini" data-action="add-child"     title="Дочернее событие">+ child</button>
        <button class="es-mini" data-action="duplicate"     title="Дублировать">⧉</button>
        <button class="es-mini es-del" data-action="delete" title="Удалить">✕</button>
      </div>
    `;

    const condsEl = document.createElement('div');
    condsEl.className = 'es-section es-conditions';
    condsEl.dataset.dropTarget = 'conditions';
    condsEl.dataset.eventId = event.id;
    if (!event.conditions || event.conditions.length === 0) {
      condsEl.innerHTML = '<div class="es-section-empty">Drop condition here</div>';
    } else {
      for (const c of event.conditions) condsEl.appendChild(this._renderRow('cond', c, event.id));
    }

    const actsEl = document.createElement('div');
    actsEl.className = 'es-section es-actions';
    actsEl.dataset.dropTarget = 'actions';
    actsEl.dataset.eventId = event.id;
    if (!event.actions || event.actions.length === 0) {
      actsEl.innerHTML = '<div class="es-section-empty">Drop action here</div>';
    } else {
      for (const a of event.actions) actsEl.appendChild(this._renderRow('action', a, event.id));
    }

    const body = document.createElement('div');
    body.className = 'es-body';
    body.appendChild(condsEl);
    body.appendChild(actsEl);

    wrap.appendChild(head);
    wrap.appendChild(body);

    if (event.children && event.children.length) {
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'es-children';
      for (const child of event.children) {
        childrenWrap.appendChild(this._renderEvent(child, depth + 1));
      }
      wrap.appendChild(childrenWrap);
    }

    return wrap;
  }

  _renderRow(kind, item, eventId) {
    const def = kind === 'cond'
      ? registry.conditions.get(item.type)
      : registry.actions.get(item.type);

    const row = document.createElement('div');
    row.className = 'es-row es-row-' + kind;
    row.dataset.rowKind = kind;
    row.dataset.rowType = item.type;
    row.dataset.eventId  = eventId;
    row.draggable = true;

    const paramsHtml = def
      ? def.params.map((p) => this._renderParam(kind, item.type, p, item.params?.[p.id])).join('')
      : `<span class="es-param-error">unknown type: ${item.type}</span>`;

    row.innerHTML = `
      <span class="es-drag-handle" title="Перетащить">⋮⋮</span>
      <span class="es-row-label">${def ? def.label : item.type}</span>
      <span class="es-params">${paramsHtml}</span>
      <button class="es-row-del" data-action="${kind === 'cond' ? 'del-condition' : 'del-action'}" title="Удалить">×</button>
    `;
    return row;
  }

  _renderParam(kind, ownerType, def, value) {
    const val = value !== undefined ? value : def.default;
    const key = `${kind}:${ownerType}:${def.id}`;

    if (def.type === 'number') {
      return `<label class="es-param"><span>${def.label}</span>
        <input type="number" data-param="${key}" value="${val}"></label>`;
    }
    if (def.type === 'string') {
      return `<label class="es-param"><span>${def.label}</span>
        <input type="text" data-param="${key}" value="${val}"></label>`;
    }
    if (def.type === 'select') {
      const opts = (def.options || []).map((o) =>
        `<option value="${o}"${o === val ? ' selected' : ''}>${o}</option>`).join('');
      return `<label class="es-param"><span>${def.label}</span>
        <select data-param="${key}">${opts}</select></label>`;
    }
    if (def.type === 'key') {
      const opts = KEY_OPTIONS.map((k) =>
        `<option value="${k}"${k === val ? ' selected' : ''}>${k}</option>`).join('');
      return `<label class="es-param"><span>${def.label}</span>
        <select data-param="${key}">${opts}</select></label>`;
    }
    if (def.type === 'target') {
      const names = new Set(['*']);
      for (const o of this.scene.objects) if (o.name) names.add(o.name);
      const opts = [...names].map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n === '*' ? '* (all dynamic)' : n}</option>`).join('');
      return `<label class="es-param"><span>${def.label}</span>
        <select data-param="${key}">${opts}</select></label>`;
    }
    return `<span class="es-param-unknown">?</span>`;
  }

  // ============================================================
  // DnD
  // ============================================================

  _attachDnD() {
    const c = this.container;

    c.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.es-row');
      if (row) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-es-row', JSON.stringify({
          eventId: +row.dataset.eventId,
          kind:    row.dataset.rowKind,
          type:    row.dataset.rowType,
        }));
        row.classList.add('dragging');
        return;
      }

      const ev = e.target.closest('.es-event');
      if (ev) {
        if (e.target.closest('.es-head-actions') ||
            e.target.closest('.es-row') ||
            e.target.closest('input, select, button')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-es-event', String(ev.dataset.eventId));
        ev.classList.add('dragging');
      }
    });

    c.addEventListener('dragend', () => {
      for (const el of c.querySelectorAll('.dragging'))
        el.classList.remove('dragging');
      for (const el of c.querySelectorAll('.drag-over'))
        el.classList.remove('drag-over');
    });

    c.addEventListener('dragover', (e) => {
      const kinds = e.dataTransfer.types;
      const isAdd   = kinds.includes('application/x-es-add');
      const isRow   = kinds.includes('application/x-es-row');
      const isEvent = kinds.includes('application/x-es-event');
      if (!isAdd && !isRow && !isEvent) return;

      const section = e.target.closest('.es-section');
      if (section && (isAdd || isRow)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = isAdd ? 'copy' : 'move';
        this._clearDropHighlight();
        section.classList.add('drag-over');
        return;
      }

      const ev = e.target.closest('.es-event');
      if (ev && isEvent) {
        const dragged = c.querySelector('.dragging');
        if (dragged && dragged !== ev) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          this._clearDropHighlight();
          ev.classList.add('drag-over');
        }
      }
    });

    c.addEventListener('dragleave', (e) => {
      const el = e.target.closest('.es-section, .es-event');
      if (el) el.classList.remove('drag-over');
    });

    c.addEventListener('drop', (e) => {
      const kinds = e.dataTransfer.types;
      const section = e.target.closest('.es-section');

      if (kinds.includes('application/x-es-add') && section) {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/x-es-add'));
        const eventId = +section.dataset.eventId;
        const target  = section.dataset.dropTarget;
        this._addFromPalette(eventId, data.kind, data.type, target);
        this._clearDropHighlight();
        return;
      }

      if (kinds.includes('application/x-es-row') && section) {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/x-es-row'));
        const toEventId = +section.dataset.eventId;
        const toKind    = section.dataset.dropTarget;
        const fromKind  = data.kind === 'cond' ? 'conditions' : 'actions';
        if (toKind === fromKind && data.eventId !== toEventId) {
          this._moveRow(data.eventId, data.kind, data.type, toEventId);
        }
        this._clearDropHighlight();
        return;
      }

      if (kinds.includes('application/x-es-event')) {
        const targetEv = e.target.closest('.es-event');
        if (!targetEv) return;
        e.preventDefault();
        const fromId = +e.dataTransfer.getData('application/x-es-event');
        const toId   = +targetEv.dataset.eventId;
        if (fromId !== toId) this._reorderEvent(fromId, toId);
        this._clearDropHighlight();
      }
    });
  }

  _clearDropHighlight() {
    for (const el of this.container.querySelectorAll('.drag-over'))
      el.classList.remove('drag-over');
  }

  // ============================================================
  // MUTATIONS
  // ============================================================

  _addFromPalette(eventId, kind, type, target) {
    const event = this._findEvent(eventId);
    if (!event) return;
    const isCond = kind === 'conditions';
    if (isCond !== (target === 'conditions')) return;

    const def = isCond ? registry.conditions.get(type) : registry.actions.get(type);
    if (!def) return;

    const params = {};
    for (const p of (def.params || [])) params[p.id] = p.default;
    const item = { type, params };

    if (isCond) {
      event.conditions = event.conditions || [];
      event.conditions.push(item);
    } else {
      event.actions = event.actions || [];
      event.actions.push(item);
    }

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _moveRow(fromEventId, kind, type, toEventId) {
    const from = this._findEvent(fromEventId);
    const to   = this._findEvent(toEventId);
    if (!from || !to) return;

    const arrName = kind === 'cond' ? 'conditions' : 'actions';
    const arr = from[arrName];
    if (!arr) return;
    const idx = arr.findIndex((x) => x.type === type);
    if (idx < 0) return;

    const [item] = arr.splice(idx, 1);
    to[arrName] = to[arrName] || [];
    to[arrName].push(item);

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _reorderEvent(fromId, toId) {
    const sheet = this._getSheet();
    const from = this._findParentArray(sheet, fromId);
    const to   = this._findParentArray(sheet, toId);
    if (!from || !to) return;
    if (from.arr !== to.arr) return;

    const [ev] = from.arr.splice(from.idx, 1);
    const newTo = from.arr.indexOf(to.arr[to.idx]);
    from.arr.splice(newTo >= 0 ? newTo : to.idx, 0, ev);

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const eventEl = btn.closest('.es-event');
    const eventId = eventEl ? +eventEl.dataset.eventId : null;

    switch (action) {
      case 'add-event':     this._addEvent(null); break;
      case 'add-condition': this._openPicker('conditions', eventId); break;
      case 'add-action':    this._openPicker('actions', eventId); break;
      case 'add-child':     this._addEvent(eventId); break;
      case 'duplicate':     this._duplicateEvent(eventId); break;
      case 'delete':
        if (confirm('Удалить событие?')) this._deleteEvent(eventId);
        break;
      case 'del-condition': {
        const row = btn.closest('.es-row');
        this._deleteRow(eventId, 'cond', row.dataset.rowType);
        break;
      }
      case 'del-action': {
        const row = btn.closest('.es-row');
        this._deleteRow(eventId, 'action', row.dataset.rowType);
        break;
      }
    }
  }

  _openPicker(kind, eventId) {
    const map = kind === 'conditions' ? registry.conditions : registry.actions;
    const items = map.all();
    const names = items.map((i) => `${i.category}/${i.label}`).join('\n');
    const typed = prompt(`Введите ID (${kind}):\n\n${names}`, items[0]?.id || '');
    if (!typed) return;
    if (!map.get(typed)) { alert('Не найдено: ' + typed); return; }

    const event = this._findEvent(eventId);
    if (!event) return;
    const def = map.get(typed);
    const params = {};
    for (const p of (def.params || [])) params[p.id] = p.default;
    if (kind === 'conditions') {
      event.conditions = event.conditions || [];
      event.conditions.push({ type: typed, params });
    } else {
      event.actions = event.actions || [];
      event.actions.push({ type: typed, params });
    }
    this._recompile();
    this.refresh();
    this.onChange();
  }

  _onInput(e) {
    const input = e.target.closest('input[data-param]');
    if (!input) return;
    this._applyParam(input);
  }

  _onChangeEl(e) {
    const sel = e.target.closest('select[data-param]');
    if (!sel) return;
    this._applyParam(sel);
  }

  _applyParam(el) {
    const key = el.dataset.param;
    const [kind, ownerType, paramId] = key.split(':');
    const rawVal = el.type === 'number' ? parseFloat(el.value) : el.value;

    const row = el.closest('.es-row');
    const eventId = +row.dataset.eventId;
    const event = this._findEvent(eventId);
    if (!event) return;

    if (kind === 'cond') {
      const c = event.conditions.find((x) => x.type === ownerType);
      if (!c) return;
      c.params = c.params || {};
      c.params[paramId] = rawVal;
    } else {
      const a = event.actions.find((x) => x.type === ownerType);
      if (!a) return;
      a.params = a.params || {};
      a.params[paramId] = rawVal;
    }

    this._recompile();
    this.onChange();
  }

  _addEvent(parentId) {
    const sheet = this._getSheet();
    const id = this._nextId(sheet);
    const ev = { id, conditions: [], actions: [], children: [], disabled: false };

    if (parentId === null) sheet.events.push(ev);
    else {
      const parent = this._findEvent(parentId);
      if (!parent) return;
      parent.children = parent.children || [];
      parent.children.push(ev);
    }
    this._recompile();
    this.refresh();
    this.onChange();
  }

  _duplicateEvent(eventId) {
    const sheet = this._getSheet();
    const original = this._findEvent(eventId);
    if (!original) return;
    const clone = JSON.parse(JSON.stringify(original));
    this._reassignIds(clone, { next: this._nextId(sheet) });
    const insertion = this._findParentArray(sheet, eventId);
    if (!insertion) return;
    insertion.arr.splice(insertion.idx + 1, 0, clone);
    this._recompile();
    this.refresh();
    this.onChange();
  }

  _deleteEvent(eventId) {
    const sheet = this._getSheet();
    const insertion = this._findParentArray(sheet, eventId);
    if (!insertion) return;
    insertion.arr.splice(insertion.idx, 1);
    this._recompile();
    this.refresh();
    this.onChange();
  }

  _deleteRow(eventId, kind, type) {
    const event = this._findEvent(eventId);
    if (!event) return;
    if (kind === 'cond') event.conditions = event.conditions.filter((c) => c.type !== type);
    else                 event.actions    = event.actions.filter((a) => a.type !== type);
    this._recompile();
    this.refresh();
    this.onChange();
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _findEvent(id, list) {
    const sheet = this._getSheet();
    list = list || sheet.events;
    for (const ev of list) {
      if (ev.id === id) return ev;
      if (ev.children && ev.children.length) {
        const f = this._findEvent(id, ev.children);
        if (f) return f;
      }
    }
    return null;
  }

  _findParentArray(sheet, id) {
    const walk = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return { arr, idx: i };
        if (arr[i].children && arr[i].children.length) {
          const r = walk(arr[i].children);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(sheet.events);
  }

  _nextId(sheet) {
    let max = 0;
    const walk = (arr) => {
      for (const ev of arr) {
        if (ev.id > max) max = ev.id;
        if (ev.children) walk(ev.children);
      }
    };
    walk(sheet.events);
    return max + 1;
  }

  _reassignIds(event, counter) {
    event.id = counter.next++;
    if (event.children) for (const c of event.children) this._reassignIds(c, counter);
  }

  _recompile() {
    if (this.runtime) this.runtime.setSheet(this.project.sheet);
  }
}