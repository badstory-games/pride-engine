import { registry } from '../engine/events/registry.js';
import { EventPopover } from './event-popover.js';

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
    this.popover = new EventPopover();
    /** @type {import('./history.js').History|null} */
    this.history = null;

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
  // UID
  // ============================================================

  _nextUid(sheet) {
    let max = 0;
    const walk = (arr) => {
      for (const ev of arr) {
        for (const c of (ev.conditions || [])) if (c.uid > max) max = c.uid;
        for (const a of (ev.actions    || [])) if (a.uid > max) max = a.uid;
        if (ev.children) walk(ev.children);
      }
    };
    walk(sheet.events);
    return max + 1;
  }

  _ensureUids() {
    const sheet = this._getSheet();
    if (!sheet) return;
    let counter = this._nextUid(sheet);
    const walk = (arr) => {
      for (const ev of arr) {
        for (const c of (ev.conditions || [])) if (!c.uid) c.uid = counter++;
        for (const a of (ev.actions    || [])) if (!a.uid) a.uid = counter++;
        if (ev.children) walk(ev.children);
      }
    };
    walk(sheet.events);
  }

  // ============================================================
  // RENDER
  // ============================================================

  _render() {
    this._ensureUids();

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
    wrap.className = 'es-event' + (event.disabled ? ' disabled' : '');
    wrap.dataset.eventId = event.id;
    wrap.style.marginLeft = (depth * 24) + 'px';
    wrap.draggable = true;

    const head = document.createElement('div');
    head.className = 'es-head';
    head.innerHTML = `
      <label class="es-head-enable" title="Enable / disable event">
        <input type="checkbox" data-action="toggle-enable"
          ${event.disabled ? '' : 'checked'}>
        <span></span>
      </label>
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
    row.dataset.rowKind  = kind;
    row.dataset.rowType  = item.type;
    row.dataset.rowUid   = String(item.uid);
    row.dataset.eventId  = eventId;
    row.draggable = true;

    const paramsHtml = def
      ? def.params.map((p) => this._renderParam(kind, item.uid, item.type, p, item.params?.[p.id])).join('')
      : `<span class="es-param-error">unknown type: ${item.type}</span>`;

    row.innerHTML = `
      <span class="es-drag-handle" title="Перетащить">⋮⋮</span>
      <span class="es-row-label">${def ? def.label : item.type}</span>
      <span class="es-params">${paramsHtml}</span>
      <button class="es-row-del" data-action="${kind === 'cond' ? 'del-condition' : 'del-action'}" title="Удалить">×</button>
    `;
    return row;
  }

  _renderParam(kind, uid, ownerType, def, value) {
    const val = value !== undefined ? value : def.default;
    const key = `${kind}:${uid}:${def.id}`;

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
    if (def.type === 'varname') {
      const names = Object.keys(this.project.vars || {});
      const inList = names.includes(val);
      const opts = names.map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n}</option>`).join('');
      const extra = inList ? '' :
        `<option value="${val}" selected>${val} (нет)</option>`;
      return `<label class="es-param"><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
    }
    if (def.type === 'target') {
      const names = new Set(['*']);
      for (const o of this.scene.objects) if (o.name) names.add(o.name);

      const inList = names.has(val);
      const opts = [...names].map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n === '*' ? '* (all dynamic)' : n}</option>`).join('');
      const extra = inList ? '' :
        `<option value="${val}" selected>${val} (нет в сцене)</option>`;

      return `<label class="es-param"><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
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
          uid:     +row.dataset.rowUid,
        }));
        row.classList.add('dragging');
        return;
      }

      const ev = e.target.closest('.es-event');
      if (ev) {
        if (e.target.closest('.es-head-actions') ||
            e.target.closest('.es-head-enable') ||
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
          this._moveRow(data.eventId, data.kind, data.uid, toEventId);
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
    const h = this.history;
    const apply = () => {
      const event = this._findEvent(eventId);
      if (!event) return;
      const isCond = kind === 'conditions';
      if (isCond !== (target === 'conditions')) return;

      const def = isCond ? registry.conditions.get(type) : registry.actions.get(type);
      if (!def) return;

      const params = {};
      for (const p of (def.params || [])) params[p.id] = p.default;

      const sheet = this._getSheet();
      const uid = this._nextUid(sheet);
      const item = { uid, type, params };

      if (isCond) {
        event.conditions = event.conditions || [];
        event.conditions.push(item);
      } else {
        event.actions = event.actions || [];
        event.actions.push(item);
      }
    };
    if (h) h.run('Add ' + kind, apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _moveRow(fromEventId, kind, uid, toEventId) {
    const h = this.history;
    const apply = () => {
      const from = this._findEvent(fromEventId);
      const to   = this._findEvent(toEventId);
      if (!from || !to) return;

      const arrName = kind === 'cond' ? 'conditions' : 'actions';
      const arr = from[arrName];
      if (!arr) return;
      const idx = arr.findIndex((x) => x.uid === uid);
      if (idx < 0) return;

      const [item] = arr.splice(idx, 1);
      to[arrName] = to[arrName] || [];
      to[arrName].push(item);
    };
    if (h) h.run('Move row', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _reorderEvent(fromId, toId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const from = this._findParentArray(sheet, fromId);
      const to   = this._findParentArray(sheet, toId);
      if (!from || !to) return;
      if (from.arr !== to.arr) return;

      // Ссылку на целевое событие берём ДО splice — иначе to.idx устареет.
      const target = to.arr[to.idx];

      const [ev] = from.arr.splice(from.idx, 1);
      const newTo = from.arr.indexOf(target);
      from.arr.splice(newTo >= 0 ? newTo : to.idx, 0, ev);
    };
    if (h) h.run('Reorder event', apply); else apply();

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
      case 'add-condition': this._openPopover(btn, 'conditions', eventId); break;
      case 'add-action':    this._openPopover(btn, 'actions', eventId); break;
      case 'add-child':     this._addEvent(eventId); break;
      case 'duplicate':     this._duplicateEvent(eventId); break;
      case 'delete':
        if (confirm('Удалить событие?')) this._deleteEvent(eventId);
        break;
      case 'del-condition': {
        const row = btn.closest('.es-row');
        this._deleteRow(eventId, 'cond', +row.dataset.rowUid);
        break;
      }
      case 'del-action': {
        const row = btn.closest('.es-row');
        this._deleteRow(eventId, 'action', +row.dataset.rowUid);
        break;
      }
    }
  }

  _openPopover(anchorBtn, kind, eventId) {
    this.popover.open(anchorBtn, kind, (type) => {
      const map = kind === 'conditions' ? registry.conditions : registry.actions;
      const def = map.get(type);
      if (!def) return;

      const h = this.history;
      const apply = () => {
        const event = this._findEvent(eventId);
        if (!event) return;

        const params = {};
        for (const p of (def.params || [])) params[p.id] = p.default;

        const sheet = this._getSheet();
        const uid = this._nextUid(sheet);
        const item = { uid, type, params };

        if (kind === 'conditions') {
          event.conditions = event.conditions || [];
          event.conditions.push(item);
        } else {
          event.actions = event.actions || [];
          event.actions.push(item);
        }
      };
      if (h) h.run('Add ' + kind, apply); else apply();

      this._recompile();
      this.refresh();
      this.onChange();
    });
  }

  _onInput(e) {
    const input = e.target.closest('input[data-param]');
    if (!input) return;
    this._applyParam(input);
  }

  _onChangeEl(e) {
    if (e.target.matches('[data-action="toggle-enable"]')) {
      const wrap = e.target.closest('.es-event');
      const eventId = +wrap.dataset.eventId;
      const h = this.history;
      const apply = () => {
        const event = this._findEvent(eventId);
        if (!event) return;
        event.disabled = !e.target.checked;
      };
      if (h) h.run('Toggle event', apply); else apply();
      const event = this._findEvent(eventId);
      if (event) wrap.classList.toggle('disabled', !!event.disabled);
      this._recompile();
      this.onChange();
      return;
    }

    const sel = e.target.closest('select[data-param]');
    if (!sel) return;
    this._applyParam(sel);
  }

  // Параметры (числа/строки/селекты) НЕ оборачиваем в undo —
  // иначе при вводе числа в поле каждая цифра станет отдельной командой.
  _applyParam(el) {
    const key = el.dataset.param;
    const [kind, uidStr, paramId] = key.split(':');
    const uid = +uidStr;
    const rawVal = el.type === 'number' ? parseFloat(el.value) : el.value;

    const row = el.closest('.es-row');
    const eventId = +row.dataset.eventId;
    const event = this._findEvent(eventId);
    if (!event) return;

    const arrName = kind === 'cond' ? 'conditions' : 'actions';
    const arr = event[arrName];
    if (!arr) return;

    const item = arr.find((x) => x.uid === uid);
    if (!item) return;

    item.params = item.params || {};
    item.params[paramId] = rawVal;

    this._recompile();
    this.onChange();
  }

  _addEvent(parentId) {
    const h = this.history;
    const apply = () => {
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
    };
    if (h) h.run('Add event', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _duplicateEvent(eventId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const original = this._findEvent(eventId);
      if (!original) return;

      const clone = JSON.parse(JSON.stringify(original));
      this._reassignEventIds(clone, { next: this._nextId(sheet) });
      this._clearUids(clone);

      const insertion = this._findParentArray(sheet, eventId);
      if (!insertion) return;
      insertion.arr.splice(insertion.idx + 1, 0, clone);
    };
    if (h) h.run('Duplicate event', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _deleteEvent(eventId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const insertion = this._findParentArray(sheet, eventId);
      if (!insertion) return;
      insertion.arr.splice(insertion.idx, 1);
    };
    if (h) h.run('Delete event', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _deleteRow(eventId, kind, uid) {
    const h = this.history;
    const apply = () => {
      const event = this._findEvent(eventId);
      if (!event) return;
      if (kind === 'cond') {
        event.conditions = event.conditions.filter((c) => c.uid !== uid);
      } else {
        event.actions = event.actions.filter((a) => a.uid !== uid);
      }
    };
    if (h) h.run('Delete row', apply); else apply();

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

  _reassignEventIds(event, counter) {
    event.id = counter.next++;
    if (event.children) for (const c of event.children) this._reassignEventIds(c, counter);
  }

  _clearUids(event) {
    for (const c of (event.conditions || [])) delete c.uid;
    for (const a of (event.actions    || [])) delete a.uid;
    for (const ch of (event.children  || [])) this._clearUids(ch);
  }

  _recompile() {
    if (this.runtime) this.runtime.setSheet(this.project.sheet);
  }
}