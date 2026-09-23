import { registry } from '../engine/events/registry.js';
import { PickerModal } from './picker-modal.js';

export class EventSheetPanel {
  constructor(container, project, eventRuntime) {
    this.container = container;
    this.project = project;
    this.runtime = eventRuntime;
    this.onChange = () => {};
    this.picker = new PickerModal();

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
    container.addEventListener('change', (e) => this._onChange(e));
  }

  setSheet(sheet) {
    this.project.sheet = sheet;
    this.refresh();
  }

  refresh() {
    this._render();
  }

  _getSheet() {
    return this.project.sheet;
  }

  // ============================================================
  // RENDER
  // ============================================================

  _render() {
    const sheet = this._getSheet();
    if (!sheet || !sheet.events.length) {
      this.listEl.innerHTML =
        '<div class="es-empty">Нет событий. Нажмите «+ Add Event».</div>';
      return;
    }
    this.listEl.innerHTML = '';
    for (const ev of sheet.events) {
      this.listEl.appendChild(this._renderEvent(ev, 0));
    }
  }

  _renderEvent(event, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'es-event';
    wrap.dataset.eventId = event.id;
    wrap.style.marginLeft = (depth * 24) + 'px';

    // Head
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

    // Conditions
    const condsEl = document.createElement('div');
    condsEl.className = 'es-section es-conditions';
    if (!event.conditions || event.conditions.length === 0) {
      condsEl.innerHTML = '<div class="es-section-empty">Нет условий</div>';
    } else {
      for (const c of event.conditions) condsEl.appendChild(this._renderRow('cond', c));
    }

    // Actions
    const actsEl = document.createElement('div');
    actsEl.className = 'es-section es-actions';
    if (!event.actions || event.actions.length === 0) {
      actsEl.innerHTML = '<div class="es-section-empty">Нет действий</div>';
    } else {
      for (const a of event.actions) actsEl.appendChild(this._renderRow('action', a));
    }

    const body = document.createElement('div');
    body.className = 'es-body';
    body.appendChild(condsEl);
    body.appendChild(actsEl);

    wrap.appendChild(head);
    wrap.appendChild(body);

    // Children
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

  _renderRow(kind, item) {
    const def = kind === 'cond'
      ? registry.conditions.get(item.type)
      : registry.actions.get(item.type);

    const row = document.createElement('div');
    row.className = 'es-row es-row-' + kind;
    if (kind === 'cond') row.dataset.condType = item.type;
    else                 row.dataset.actType  = item.type;

    const paramsHtml = def
      ? def.params.map((p) => this._renderParam(kind, item.type, p, item.params?.[p.id])).join('')
      : `<span class="es-param-error">unknown type: ${item.type}</span>`;

    row.innerHTML = `
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
    if (def.type === 'key' || def.type === 'target') {
      const ph = def.type === 'target' ? '* или Name' : 'Space';
      return `<label class="es-param"><span>${def.label}</span>
        <input type="text" data-param="${key}" value="${val}" placeholder="${ph}"></label>`;
    }
    return `<span class="es-param-unknown">?</span>`;
  }

  // ============================================================
  // EVENTS
  // ============================================================

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const eventEl = btn.closest('.es-event');
    const eventId = eventEl ? +eventEl.dataset.eventId : null;

    switch (action) {
      case 'add-event':      this._addEvent(null); break;
      case 'add-condition':  this._openPicker('conditions', eventId); break;
      case 'add-action':     this._openPicker('actions', eventId); break;
      case 'add-child':      this._addEvent(eventId); break;
      case 'duplicate':      this._duplicateEvent(eventId); break;
      case 'delete':
        if (confirm('Удалить событие?')) this._deleteEvent(eventId);
        break;
      case 'del-condition': {
        const row = btn.closest('.es-row');
        this._deleteCondition(eventId, row.dataset.condType);
        break;
      }
      case 'del-action': {
        const row = btn.closest('.es-row');
        this._deleteAction(eventId, row.dataset.actType);
        break;
      }
    }
  }

  _onInput(e) {
    const input = e.target.closest('input[data-param], select[data-param]');
    if (!input) return;

    const key = input.dataset.param;
    const [kind, ownerType, paramId] = key.split(':');
    const rawVal = input.type === 'number' ? parseFloat(input.value) : input.value;

    const eventEl = input.closest('.es-event');
    const eventId = eventEl ? +eventEl.dataset.eventId : null;
    const row = input.closest('.es-row');
    if (!row || eventId === null) return;

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
    if (this.onChange) this.onChange();
  }

  _onChange(e) {
    if (e.target.matches('select[data-param]')) this._onInput(e);
  }

  // ============================================================
  // MUTATIONS
  // ============================================================

  _openPicker(kind, eventId) {
    const items = kind === 'conditions'
      ? registry.conditions.all()
      : registry.actions.all();
    const title = kind === 'conditions' ? 'Выбрать условие' : 'Выбрать действие';

    this.picker.open(title, items, (type) => {
      const def = kind === 'conditions'
        ? registry.conditions.get(type)
        : registry.actions.get(type);

      const params = {};
      for (const p of (def.params || [])) params[p.id] = p.default;

      const event = this._findEvent(eventId);
      if (!event) return;

      if (kind === 'conditions') {
        event.conditions = event.conditions || [];
        event.conditions.push({ type, params });
      } else {
        event.actions = event.actions || [];
        event.actions.push({ type, params });
      }

      this._recompile();
      this.refresh();
      if (this.onChange) this.onChange();
    });
  }

  _addEvent(parentId) {
    const sheet = this._getSheet();
    const id = this._nextId(sheet);
    const ev = { id, conditions: [], actions: [], children: [], disabled: false };

    if (parentId === null) {
      sheet.events.push(ev);
    } else {
      const parent = this._findEvent(parentId);
      if (!parent) return;
      parent.children = parent.children || [];
      parent.children.push(ev);
    }

    this._recompile();
    this.refresh();
    if (this.onChange) this.onChange();
  }

  _duplicateEvent(eventId) {
    const sheet = this._getSheet();
    const original = this._findEvent(eventId);
    if (!original) return;

    const clone = JSON.parse(JSON.stringify(original));
    const counter = { next: this._nextId(sheet) };
    this._reassignIds(clone, counter);

    const insertion = this._findParentArray(sheet, eventId);
    if (!insertion) return;
    insertion.arr.splice(insertion.idx + 1, 0, clone);

    this._recompile();
    this.refresh();
    if (this.onChange) this.onChange();
  }

  _deleteEvent(eventId) {
    const sheet = this._getSheet();
    const insertion = this._findParentArray(sheet, eventId);
    if (!insertion) return;
    insertion.arr.splice(insertion.idx, 1);

    this._recompile();
    this.refresh();
    if (this.onChange) this.onChange();
  }

  _deleteCondition(eventId, type) {
    const event = this._findEvent(eventId);
    if (!event) return;
    event.conditions = event.conditions.filter((c) => c.type !== type);
    this._recompile();
    this.refresh();
    if (this.onChange) this.onChange();
  }

  _deleteAction(eventId, type) {
    const event = this._findEvent(eventId);
    if (!event) return;
    event.actions = event.actions.filter((a) => a.type !== type);
    this._recompile();
    this.refresh();
    if (this.onChange) this.onChange();
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
        const found = this._findEvent(id, ev.children);
        if (found) return found;
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
    if (event.children) {
      for (const c of event.children) this._reassignIds(c, counter);
    }
  }

  _recompile() {
    if (this.runtime) this.runtime.setSheet(this.project.sheet);
  }
}