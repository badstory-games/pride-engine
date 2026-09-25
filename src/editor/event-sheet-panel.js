import { registry } from '../engine/events/registry.js';
import { EventPopover } from './event-popover.js';
import { Modal } from './modal.js';
import { icon } from './icons.js';
import { optionLabel } from './options-i18n.js';
import { computeDefaultParams } from './param-defaults.js';
import {
  EVENT, GROUP, COMMENT,
  kindOf,
  walkEvents, nextId,
  findElement, findParentArray,
} from '../engine/events/sheet-utils.js';

const KEY_OPTIONS = [
  'Space', 'Enter', 'Escape', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyJ', 'KeyK', 'KeyL',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
];

const COMMENT_COLORS = ['yellow', 'green', 'blue', 'red', 'gray'];

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

    this._refreshRaf = null;

    container.innerHTML = `
      <div class="es-toolbar">
        <h3>Лист событий</h3>
        <div class="es-toolbar-actions">
          <button class="topbtn" data-action="add-event">
            ${icon('plus')}<span>Событие</span>
          </button>
          <button class="topbtn" data-action="add-group">
            ${icon('git-branch')}<span>Группа</span>
          </button>
          <button class="topbtn" data-action="add-comment">
            ${icon('copy')}<span>Комментарий</span>
          </button>
        </div>
      </div>
      <div class="es-list"></div>
    `;
    this.listEl = container.querySelector('.es-list');

    container.addEventListener('click',  (e) => this._onClick(e));
    container.addEventListener('input',  (e) => this._onInput(e));
    container.addEventListener('change', (e) => this._onChangeEl(e));
    container.addEventListener('keydown', (e) => this._onKeydown(e));
    container.addEventListener('blur', (e) => this._onBlur(e), true);

    this._attachDnD();
  }

  destroy() {
    if (this._refreshRaf != null) {
      cancelAnimationFrame(this._refreshRaf);
      this._refreshRaf = null;
    }
  }

  setSheet(sheet) {
    this.project.sheet = sheet;
    this.refresh();
  }

  /**
   * Асинхронный (rAF) рендер. Множественные вызовы в одном кадре
   * схлопываются в один _render() — критично, когда editor.onChange
   * дёргается на каждый mousemove при drag.
   */
  refresh() {
    if (this._refreshRaf != null) return;
    this._refreshRaf = requestAnimationFrame(() => {
      this._refreshRaf = null;
      this._render();
    });
  }

  /** Синхронный рендер. Использовать, когда DOM нужен «прямо сейчас». */
  refreshNow() {
    if (this._refreshRaf != null) {
      cancelAnimationFrame(this._refreshRaf);
      this._refreshRaf = null;
    }
    this._render();
  }

  _getSheet() { return this.project.sheet; }

  // ============================================================
  // UID
  // ============================================================

  _nextUid(sheet) {
    let max = 0;
    walkEvents(sheet.events || [], (ev) => {
      for (const c of (ev.conditions || [])) if (c.uid > max) max = c.uid;
      for (const a of (ev.actions    || [])) if (a.uid > max) max = a.uid;
    });
    return max + 1;
  }

  _ensureUids() {
    const sheet = this._getSheet();
    if (!sheet) return;
    let counter = this._nextUid(sheet);
    walkEvents(sheet.events || [], (ev) => {
      for (const c of (ev.conditions || [])) if (!c.uid) c.uid = counter++;
      for (const a of (ev.actions    || [])) if (!a.uid) a.uid = counter++;
    });
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  _validateEvent(event) {
    const paramMap = new Map();
    const summary = [];

    const checkItems = (items, kind) => {
      for (const item of items || []) {
        const def = kind === 'cond'
          ? registry.conditions.get(item.type)
          : registry.actions.get(item.type);

        if (!def) {
          summary.push(`Неизвестный ${kind === 'cond' ? 'условие' : 'действие'}: ${item.type}`);
          continue;
        }

        for (const p of (def.params || [])) {
          const val = item.params?.[p.id];
          const msg = this._validateParam(p, val, item.params);
          if (msg) {
            paramMap.set(`${kind}:${item.uid}:${p.id}`, msg);
            summary.push(`${def.label || item.type} → ${p.label || p.id}: ${msg}`);
          }
        }
      }
    };

    checkItems(event.conditions, 'cond');
    checkItems(event.actions, 'action');

    return { count: summary.length, summary, paramMap };
  }

  _validateParam(def, val, allParams) {
    if (val === undefined || val === null || val === '') return null;

    if (def.type === 'prefab') {
      if (!val) return null;
      const exists = this.scene.objects.some((o) => o.name === val);
      return exists ? null : `Шаблон «${val}» не найден`;
    }

    if (def.type === 'target') {
      if (val === '*') return null;
      const exists = this.scene.objects.some((o) => o.name === val);
      return exists ? null : `Объект «${val}» не найден на сцене`;
    }

    if (def.type === 'varname') {
      const vars = this.project.vars || {};
      const varsInit = this.project.varsInitial || {};
      const exists = val in vars || val in varsInit;
      return exists ? null : `Глобальная переменная «${val}» не найдена`;
    }

    if (def.type === 'instvar') {
      const target = (allParams && allParams.target) || '*';
      for (const o of this.scene.objects) {
        if (target === '*' || o.name === target) {
          if (o.properties && val in o.properties) return null;
        }
      }
      const who = target === '*'
        ? 'ни у одного объекта'
        : `у объекта «${target}»`;
      return `Переменная «${val}» не найдена ${who}`;
    }

    return null;
  }

  // ============================================================
  // RENDER
  // ============================================================

  _render() {
    this._ensureUids();

    const sheet = this._getSheet();
    this.listEl.innerHTML = '';
    if (!sheet || !sheet.events.length) {
      const empty = document.createElement('div');
      empty.className = 'es-empty';
      empty.textContent = 'Нет событий. Перетащите условие из палитры или нажмите «+ Событие».';
      this.listEl.appendChild(empty);
      return;
    }

    for (const el of sheet.events) {
      this.listEl.appendChild(this._renderElement(el, 0));
    }
  }

  _renderElement(el, depth) {
    const k = kindOf(el);
    if (k === GROUP)   return this._renderGroup(el, depth);
    if (k === COMMENT) return this._renderComment(el, depth);
    return this._renderEvent(el, depth);
  }

  _renderGroup(group, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'es-group' +
      (group.disabled ? ' disabled' : '') +
      (group.collapsed ? ' collapsed' : '');
    wrap.dataset.elementId = group.id;
    wrap.dataset.elementType = 'group';
    wrap.style.marginLeft = (depth * 24) + 'px';

    const head = document.createElement('div');
    head.className = 'es-group-head';
    head.innerHTML = `
      <span class="es-element-drag"
        draggable="true"
        title="Перетащить группу">${icon('grip-vertical')}</span>
      <label class="es-head-enable" title="Включить / выключить группу">
        <input type="checkbox" data-action="toggle-group-enable"
          ${group.disabled ? '' : 'checked'}>
        <span></span>
      </label>
      <button class="es-group-toggle" data-action="toggle-group-collapse"
        title="${group.collapsed ? 'Развернуть' : 'Свернуть'}"
        draggable="false">
        ${icon(group.collapsed ? 'chevron-down' : 'chevron-up')}
      </button>
      <input type="text" class="es-group-name"
        data-action="rename-group"
        draggable="false"
        value="${this._escapeAttr(group.name || 'Группа')}"
        title="Имя группы">
      <div class="es-head-actions">
        <button class="es-mini" data-action="add-group-event" title="Добавить событие в группу" draggable="false">
          ${icon('plus')}<span>событие</span>
        </button>
        <button class="es-mini es-del" data-action="delete-group" title="Удалить группу" draggable="false">
          ${icon('x')}
        </button>
      </div>
    `;
    wrap.appendChild(head);

    if (!group.collapsed) {
      const body = document.createElement('div');
      body.className = 'es-group-body';
      body.dataset.groupId = group.id;
      if (!group.children || group.children.length === 0) {
        body.innerHTML = '<div class="es-section-empty">Пустая группа. Нажмите «+ событие» или перетащите события сюда.</div>';
      } else {
        for (const child of group.children) {
          body.appendChild(this._renderElement(child, depth + 1));
        }
      }
      wrap.appendChild(body);
    }

    return wrap;
  }

  _renderComment(comment, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'es-comment';
    wrap.dataset.elementId = comment.id;
    wrap.dataset.elementType = 'comment';
    wrap.dataset.color = comment.color || 'yellow';
    wrap.style.marginLeft = (depth * 24) + 'px';

    const head = document.createElement('div');
    head.className = 'es-comment-head';
    head.innerHTML = `
      <span class="es-element-drag"
        draggable="true"
        title="Перетащить комментарий">${icon('grip-vertical')}</span>
      <span class="es-comment-label">Комментарий</span>
      <div class="es-comment-colors">
        ${COMMENT_COLORS.map((c) => `
          <button class="es-comment-color" data-action="set-comment-color"
            data-color="${c}" title="${c}" draggable="false"></button>
        `).join('')}
      </div>
      <button class="es-mini es-del" data-action="delete-comment" title="Удалить" draggable="false">
        ${icon('x')}
      </button>
    `;
    wrap.appendChild(head);

    const text = document.createElement('div');
    text.className = 'es-comment-text';
    text.contentEditable = 'true';
    text.spellcheck = false;
    text.dataset.commentText = String(comment.id);
    text.dataset.placeholder = 'Текст комментария…';
    text.textContent = comment.text || '';
    wrap.appendChild(text);

    return wrap;
  }

  _renderEvent(event, depth) {
    const validation = this._validateEvent(event);

    const wrap = document.createElement('div');
    wrap.className = 'es-event' + (event.disabled ? ' disabled' : '');
    if (validation.count > 0) wrap.classList.add('has-warning');
    wrap.dataset.eventId = event.id;
    wrap.dataset.elementId = event.id;
    wrap.dataset.elementType = 'event';
    wrap.style.marginLeft = (depth * 24) + 'px';

    const warnIconHtml = validation.count > 0
      ? `<span class="es-warn" data-tooltip="${this._escapeAttr(validation.summary.join('\n'))}">${icon('alert')}</span>`
      : '';

    const head = document.createElement('div');
    head.className = 'es-head';
    head.innerHTML = `
      <span class="es-element-drag"
        draggable="true"
        title="Перетащить событие">${icon('grip-vertical')}</span>
      <label class="es-head-enable" title="Включить / выключить событие">
        <input type="checkbox" data-action="toggle-enable"
          ${event.disabled ? '' : 'checked'}>
        <span></span>
      </label>
      ${warnIconHtml}
      <span class="es-event-id">#${event.id}</span>
      <div class="es-head-actions">
        <button class="es-mini" data-action="add-condition" title="Добавить условие" draggable="false">
          ${icon('plus')}<span>условие</span>
        </button>
        <button class="es-mini" data-action="add-action" title="Добавить действие" draggable="false">
          ${icon('plus')}<span>действие</span>
        </button>
        <button class="es-mini" data-action="add-child" title="Добавить дочернее событие" draggable="false">
          ${icon('git-branch')}
        </button>
        <button class="es-mini" data-action="duplicate" title="Дублировать" draggable="false">
          ${icon('copy')}
        </button>
        <button class="es-mini es-del" data-action="delete" title="Удалить" draggable="false">
          ${icon('x')}
        </button>
      </div>
    `;

    const condsEl = document.createElement('div');
    condsEl.className = 'es-section es-conditions';
    condsEl.dataset.dropTarget = 'conditions';
    condsEl.dataset.eventId = event.id;
    if (!event.conditions || event.conditions.length === 0) {
      condsEl.innerHTML = '<div class="es-section-empty">Перетащите условие сюда</div>';
    } else {
      for (const c of event.conditions) {
        condsEl.appendChild(this._renderRow('cond', c, event.id, validation));
      }
    }

    const actsEl = document.createElement('div');
    actsEl.className = 'es-section es-actions';
    actsEl.dataset.dropTarget = 'actions';
    actsEl.dataset.eventId = event.id;
    if (!event.actions || event.actions.length === 0) {
      actsEl.innerHTML = '<div class="es-section-empty">Перетащите действие сюда</div>';
    } else {
      for (const a of event.actions) {
        actsEl.appendChild(this._renderRow('action', a, event.id, validation));
      }
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

  _renderRow(kind, item, eventId, validation) {
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
      ? def.params.map((p) => {
          const key = `${kind}:${item.uid}:${p.id}`;
          const warnMsg = validation?.paramMap.get(key) || null;
          return this._renderParam(
            kind, item.uid, item.type, p,
            item.params?.[p.id], item.params, warnMsg
          );
        }).join('')
      : `<span class="es-param-error">неизвестный тип: ${item.type}</span>`;

    row.innerHTML = `
      <span class="es-drag-handle" title="Перетащить">${icon('grip-vertical')}</span>
      <span class="es-row-label">${def ? def.label : item.type}</span>
      <span class="es-params">${paramsHtml}</span>
      <button class="es-row-del" data-action="${kind === 'cond' ? 'del-condition' : 'del-action'}" title="Удалить" draggable="false">
        ${icon('x')}
      </button>
    `;
    return row;
  }

  _renderParam(kind, uid, ownerType, def, value, allParams, warnMsg) {
    const val = value !== undefined ? value : def.default;
    const key = `${kind}:${uid}:${def.id}`;

    const cls  = 'es-param' + (warnMsg ? ' invalid' : '');
    const attr = warnMsg ? ` data-tooltip="${this._escapeAttr(warnMsg)}"` : '';

    if (def.type === 'number') {
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <input type="number" data-param="${key}" value="${val}"></label>`;
    }
    if (def.type === 'string') {
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <input type="text" data-param="${key}" value="${val}"></label>`;
    }
    if (def.type === 'select') {
      const opts = (def.options || []).map((o) =>
        `<option value="${o}"${o === val ? ' selected' : ''}>${optionLabel(o, def.id)}</option>`
      ).join('');
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${opts}</select></label>`;
    }
    if (def.type === 'key') {
      const opts = KEY_OPTIONS.map((k) =>
        `<option value="${k}"${k === val ? ' selected' : ''}>${k}</option>`).join('');
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${opts}</select></label>`;
    }
    if (def.type === 'varname') {
      const names = Object.keys(this.project.vars || {});
      const has = names.includes(val);
      const opts = names.map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n}</option>`).join('');

      if (!val) {
        const placeholder = `<option value="" selected>— выберите переменную —</option>`;
        return `<label class="${cls}"${attr}><span>${def.label}</span>
          <select data-param="${key}">${placeholder}${opts}</select></label>`;
      }

      const extra = has ? '' :
        `<option value="${val}" selected>${val} (нет)</option>`;
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
    }
    if (def.type === 'prefab') {
      const names = new Set();
      for (const o of this.scene.objects) if (o.name) names.add(o.name);
      const list = [...names].sort();

      const placeholderText = list.length === 0
        ? '— нет объектов —'
        : '— выберите шаблон —';

      if (!val) {
        const ph = `<option value="" selected>${placeholderText}</option>`;
        const opts = list.map((n) => `<option value="${n}">${n}</option>`).join('');
        return `<label class="${cls}"${attr}><span>${def.label}</span>
          <select data-param="${key}">${ph}${opts}</select></label>`;
      }

      const has = list.includes(val);
      const extra = has ? '' :
        `<option value="${val}" selected>${val} (нет в сцене)</option>`;
      const opts = list.map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n}</option>`).join('');
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
    }
    if (def.type === 'target') {
      const names = new Set(['*']);
      for (const o of this.scene.objects) if (o.name) names.add(o.name);

      const inList = names.has(val);
      const opts = [...names].map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n === '*' ? '* (Все объекты, с динамическим типом тела)' : n}</option>`).join('');
      const extra = inList ? '' :
        `<option value="${val}" selected>${val} (нет в сцене)</option>`;

      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
    }

    if (def.type === 'instvar') {
      const target = (allParams && allParams.target) || '*';
      const names = new Set();
      for (const o of this.scene.objects) {
        if (target === '*' || o.name === target) {
          for (const n of Object.keys(o.properties || {})) names.add(n);
        }
      }
      const list = [...names].sort();

      const placeholderText = list.length === 0
        ? '— нет переменных —'
        : '— выберите переменную —';

      if (!val) {
        const placeholder = `<option value="" selected>${placeholderText}</option>`;
        const opts = list.map((n) =>
          `<option value="${n}">${n}</option>`).join('');
        return `<label class="${cls}"${attr}><span>${def.label}</span>
          <select data-param="${key}">${placeholder}${opts}</select></label>`;
      }

      const inList = list.includes(val);
      const opts = list.map((n) =>
        `<option value="${n}"${n === val ? ' selected' : ''}>${n}</option>`).join('');
      const extra = inList ? '' :
        `<option value="${val}" selected>${val} (нет в сцене)</option>`;
      return `<label class="${cls}"${attr}><span>${def.label}</span>
        <select data-param="${key}">${extra}${opts}</select></label>`;
    }

    return `<span class="es-param-unknown">?</span>`;
  }

  _escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
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

      const handle = e.target.closest('.es-element-drag');
      if (!handle) return;

      const el = handle.closest('[data-element-id]');
      if (!el) return;

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-es-element', String(el.dataset.elementId));
      el.classList.add('dragging');
    });

    c.addEventListener('dragend', () => {
      for (const el of c.querySelectorAll('.dragging'))
        el.classList.remove('dragging');
      this._clearDropHighlight();
    });

    c.addEventListener('dragover', (e) => {
      const kinds = e.dataTransfer.types;
      const isAdd     = kinds.includes('application/x-es-add');
      const isRow     = kinds.includes('application/x-es-row');
      const isElement = kinds.includes('application/x-es-element');
      if (!isAdd && !isRow && !isElement) return;

      if (isAdd || isRow) {
        const section = e.target.closest('.es-section');
        if (section) {
          e.preventDefault();
          e.dataTransfer.dropEffect = isAdd ? 'copy' : 'move';
          this._clearDropHighlight();
          section.classList.add('drag-over');
        } else {
          this._clearDropHighlight();
        }
        return;
      }

      const draggingId = this._getDraggingId();
      if (draggingId == null) return;

      const targetEl  = e.target.closest('[data-element-id]');
      const groupBody = e.target.closest('.es-group-body');

      if (!targetEl) {
        if (groupBody) {
          const gId = +groupBody.dataset.groupId;
          if (gId === draggingId) return;
          if (this._isDescendant(draggingId, gId)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          this._clearDropHighlight();
          const g = groupBody.closest('.es-group');
          if (g) g.classList.add('drop-inside');
        } else {
          this._clearDropHighlight();
        }
        return;
      }

      const targetId = +targetEl.dataset.elementId;
      if (targetId === draggingId) return;
      if (this._isDescendant(draggingId, targetId)) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._clearDropHighlight();

      const rect  = targetEl.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;

      const isGroup = targetEl.classList.contains('es-group');

      if (isGroup && ratio >= 0.3 && ratio <= 0.7) {
        targetEl.classList.add('drop-inside');
        return;
      }

      if (ratio < 0.5) targetEl.classList.add('drop-before');
      else             targetEl.classList.add('drop-after');
    });

    c.addEventListener('dragleave', (e) => {
      const el = e.target.closest(
        '.es-section, .es-event, .es-group, .es-comment'
      );
      if (!el) return;
      const to = e.relatedTarget;
      if (to && el.contains(to)) return;
      el.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-inside');
    });

    c.addEventListener('drop', (e) => {
      const kinds = e.dataTransfer.types;

      if (kinds.includes('application/x-es-add')) {
        const section = e.target.closest('.es-section');
        if (!section) return;
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/x-es-add'));
        const eventId = +section.dataset.eventId;
        const target  = section.dataset.dropTarget;
        this._addFromPalette(eventId, data.kind, data.type, target);
        this._clearDropHighlight();
        return;
      }

      if (kinds.includes('application/x-es-row')) {
        const section = e.target.closest('.es-section');
        if (!section) return;
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

      if (!kinds.includes('application/x-es-element')) return;
      e.preventDefault();

      const fromId = +e.dataTransfer.getData('application/x-es-element');

      const inside = c.querySelector('.drop-inside');
      const before = c.querySelector('.drop-before');
      const after  = c.querySelector('.drop-after');

      if (inside) {
        this._moveElement(fromId, { groupId: +inside.dataset.elementId });
      } else if (before) {
        this._moveElement(fromId, { targetId: +before.dataset.elementId, position: 'before' });
      } else if (after) {
        this._moveElement(fromId, { targetId: +after.dataset.elementId,  position: 'after'  });
      }

      this._clearDropHighlight();
    });
  }

  _clearDropHighlight() {
    for (const el of this.container.querySelectorAll(
      '.drag-over, .drop-before, .drop-after, .drop-inside'
    )) {
      el.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-inside');
    }
  }

  _getDraggingId() {
    const el = this.container.querySelector('.dragging');
    if (!el || !el.dataset) return null;
    return el.dataset.elementId ? +el.dataset.elementId : null;
  }

  _isDescendant(fromId, toId) {
    const sheet = this._getSheet();
    const fromEl = findElement(sheet, fromId);
    if (!fromEl) return false;
    const stack = [fromEl];
    while (stack.length) {
      const cur = stack.pop();
      if (cur.id === toId) return true;
      if (cur.children) for (const c of cur.children) stack.push(c);
    }
    return false;
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

      const params = computeDefaultParams(def, {
        scene: this.scene,
        vars:  this.project.vars || {},
      });

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

  _moveElement(fromId, target) {
    const sheet = this._getSheet();
    if (!sheet) return;

    const from = findParentArray(sheet, fromId);
    if (!from) return;

    let toArr;
    let toIdx;

    if (target.groupId != null) {
      const group = findElement(sheet, target.groupId);
      if (!group || kindOf(group) !== GROUP) return;
      toArr = group.children = group.children || [];
      toIdx = toArr.length;
    } else {
      const to = findParentArray(sheet, target.targetId);
      if (!to) return;
      toArr = to.arr;
      toIdx = target.position === 'before' ? to.idx : to.idx + 1;
    }

    if (toArr === from.arr && (toIdx === from.idx || toIdx === from.idx + 1)) return;

    const h = this.history;
    const apply = () => {
      const from2 = findParentArray(sheet, fromId);
      if (!from2) return;

      const [el] = from2.arr.splice(from2.idx, 1);

      let adjIdx = toIdx;
      if (from2.arr === toArr && from2.idx < toIdx) adjIdx--;

      toArr.splice(adjIdx, 0, el);

      if (target.groupId != null) {
        const g = findElement(sheet, target.groupId);
        if (g) g.collapsed = false;
      }
    };
    if (h) h.run('Move element', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    const elementEl = btn.closest('[data-element-id]');
    const elementId = elementEl ? +elementEl.dataset.elementId : null;

    switch (action) {
      case 'add-event':        this._addEvent(null, null); break;
      case 'add-group':        this._addGroup(null); break;
      case 'add-comment':      this._addComment(null); break;

      case 'toggle-group-collapse': {
        const g = this._findElement(elementId);
        if (!g) return;
        this._toggleGroupCollapsed(g);
        return;
      }
      case 'add-group-event':  this._addEvent(null, elementId); break;
      case 'delete-group':     this._confirmDelete('group', elementId); return;

      case 'delete-comment':   this._deleteComment(elementId); return;
      case 'set-comment-color': {
        const color = btn.dataset.color;
        this._setCommentColor(elementId, color);
        return;
      }
    }

    const eventEl = btn.closest('.es-event');
    const eventId = eventEl ? +eventEl.dataset.eventId : null;

    switch (action) {
      case 'add-condition': this._openPopover(btn, 'conditions', eventId); break;
      case 'add-action':    this._openPopover(btn, 'actions', eventId); break;
      case 'add-child':     this._addEvent(eventId, null); break;
      case 'duplicate':     this._duplicateEvent(eventId); break;
      case 'delete':        this._confirmDelete('event', eventId); return;
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

  _onKeydown(e) {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!el || !el.classList) return;

    if (el.classList.contains('es-group-name')) {
      e.preventDefault();
      el.blur();
      return;
    }

    if (el.matches && el.matches('input[data-param], select[data-param]')) {
      e.preventDefault();
      el.blur();
    }
  }

  _onBlur(e) {
    const el = e.target;
    if (!el || !el.classList) return;

    if (el.classList.contains('es-group-name')) {
      this._commitGroupName(el);
      return;
    }
    if (el.classList.contains('es-comment-text')) {
      this._commitCommentText(el);
      return;
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

        const params = computeDefaultParams(def, {
          scene: this.scene,
          vars:  this.project.vars || {},
        });

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

    if (e.target.matches('[data-action="toggle-group-enable"]')) {
      const wrap = e.target.closest('.es-group');
      const groupId = +wrap.dataset.elementId;
      const h = this.history;
      const apply = () => {
        const g = this._findElement(groupId);
        if (!g) return;
        g.disabled = !e.target.checked;
      };
      if (h) h.run('Toggle group', apply); else apply();
      const g = this._findElement(groupId);
      if (g) wrap.classList.toggle('disabled', !!g.disabled);
      this._recompile();
      this.onChange();
      return;
    }

    const sel = e.target.closest('select[data-param]');
    if (!sel) return;
    this._applyParam(sel);
  }

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

    if (paramId === 'target' || paramId === 'var' || paramId === 'name') {
      this.refresh();
    } else {
      this._refreshEventValidation(eventId);
    }
  }

  _refreshEventValidation(eventId) {
    const el = this.container.querySelector(`.es-event[data-event-id="${eventId}"]`);
    if (!el) return;
    const event = this._findEvent(eventId);
    if (!event) return;

    const validation = this._validateEvent(event);

    el.classList.toggle('has-warning', validation.count > 0);

    const head = el.querySelector('.es-head');
    if (head) {
      let warn = head.querySelector('.es-warn');
      if (validation.count > 0) {
        if (!warn) {
          warn = document.createElement('span');
          warn.className = 'es-warn';
          const idEl = head.querySelector('.es-event-id');
          if (idEl) head.insertBefore(warn, idEl);
          else head.appendChild(warn);
        }
        warn.innerHTML = icon('alert');
        warn.dataset.tooltip = validation.summary.join('\n');
      } else if (warn) {
        warn.remove();
      }
    }

    for (const label of el.querySelectorAll('.es-param')) {
      label.classList.remove('invalid');
      label.removeAttribute('data-tooltip');
    }
    for (const [key, msg] of validation.paramMap) {
      const [kind, uidStr] = key.split(':');
      const row = el.querySelector(`.es-row[data-row-kind="${kind}"][data-row-uid="${uidStr}"]`);
      if (!row) continue;
      const label = [...row.querySelectorAll('.es-param')].find((l) => {
        const el2 = l.querySelector(`[data-param="${key}"]`);
        return !!el2;
      });
      if (label) {
        label.classList.add('invalid');
        label.dataset.tooltip = msg;
      }
    }
  }

  // --- event CRUD ---

  _addEvent(parentEventId, parentGroupId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const id = nextId(sheet);
      const ev = { id, conditions: [], actions: [], children: [], disabled: false };

      if (parentEventId != null) {
        const parent = this._findEvent(parentEventId);
        if (!parent) return;
        parent.children = parent.children || [];
        parent.children.push(ev);
      } else if (parentGroupId != null) {
        const g = this._findElement(parentGroupId);
        if (!g || kindOf(g) !== GROUP) return;
        g.children = g.children || [];
        g.children.push(ev);
        g.collapsed = false;
      } else {
        sheet.events.push(ev);
      }
    };
    if (h) h.run('Add event', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();

    if (parentEventId == null && parentGroupId == null) {
      this._maybeShowOrderHint();
    }
  }

  _maybeShowOrderHint() {
    const sheet = this._getSheet();
    if (!sheet) return;

    const count = sheet.events.filter((el) => (el._type || 'event') === 'event').length;
    if (count < 2) return;

    import('./hints.js').then(({ showHintOnce }) => {
      showHintOnce(this.project, 'eventOrder', () => {
        Modal.alert({
          title: 'Порядок событий важен',
          message:
            'События выполняются сверху вниз — в том порядке, в котором они ' +
            'находятся в списке.\n\n' +
            'Это влияет на результат, если события меняют одни и те же ' +
            'переменные, свойства объектов или срабатывают на одно и то же ' +
            'условие. Верхнее событие всегда выполняется раньше нижнего.\n\n' +
            'Меняйте порядок перетаскиванием за ручку ⠿ слева от события, ' +
            'группы или комментария.\n\n' +
            'Отключить все подсказки можно во вкладке «Проект» → «Помощь».',
          okText: 'Понятно',
        });
      });
    });
  }

  _duplicateEvent(eventId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const original = this._findEvent(eventId);
      if (!original) return;

      const clone = JSON.parse(JSON.stringify(original));
      this._reassignEventIds(clone, { next: nextId(sheet) });
      this._clearUids(clone);

      const insertion = findParentArray(sheet, eventId);
      if (!insertion) return;
      insertion.arr.splice(insertion.idx + 1, 0, clone);
    };
    if (h) h.run('Duplicate event', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  async _confirmDelete(kind, id) {
    const messages = {
      event: 'Событие и все его условия, действия и дочерние события будут удалены.',
      group: 'Группа и все события внутри неё будут удалены.',
    };
    const titles = {
      event: 'Удалить событие',
      group: 'Удалить группу',
    };
    const ok = await Modal.confirm({
      title: titles[kind] || 'Удалить',
      message: messages[kind] || '',
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    });
    if (!ok) return;

    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const insertion = findParentArray(sheet, id);
      if (!insertion) return;
      insertion.arr.splice(insertion.idx, 1);
    };
    if (h) h.run('Delete ' + kind, apply); else apply();

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

  // --- group ---

  _addGroup(parentGroupId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const id = nextId(sheet);
      const group = {
        id, _type: 'group',
        name: 'Группа ' + id,
        collapsed: false,
        disabled: false,
        children: [],
      };

      if (parentGroupId != null) {
        const g = this._findElement(parentGroupId);
        if (!g || kindOf(g) !== GROUP) return;
        g.children = g.children || [];
        g.children.push(group);
        g.collapsed = false;
      } else {
        sheet.events.push(group);
      }
    };
    if (h) h.run('Add group', apply); else apply();

    this._recompile();
    this.refresh();
    this.onChange();
  }

  _toggleGroupCollapsed(group) {
    const h = this.history;
    const apply = () => { group.collapsed = !group.collapsed; };
    if (h) h.run('Toggle group', apply); else apply();

    this.refresh();
    this.onChange();
  }

  _commitGroupName(input) {
    const wrap = input.closest('.es-group');
    if (!wrap) return;
    const group = this._findElement(+wrap.dataset.elementId);
    if (!group) return;

    const newName = String(input.value || '').trim() || 'Группа';
    if (group.name === newName) return;

    const h = this.history;
    const apply = () => { group.name = newName; };
    if (h) h.run('Rename group', apply); else apply();

    input.value = newName;
    this.onChange();
  }

  // --- comment ---

  _addComment(parentGroupId) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const id = nextId(sheet);
      const c = {
        id, _type: 'comment',
        text: 'Новый комментарий',
        color: 'yellow',
      };
      if (parentGroupId != null) {
        const g = this._findElement(parentGroupId);
        if (!g || kindOf(g) !== GROUP) return;
        g.children = g.children || [];
        g.children.push(c);
      } else {
        sheet.events.push(c);
      }
    };
    if (h) h.run('Add comment', apply); else apply();

    this.refresh();
    this.onChange();
  }

  _deleteComment(id) {
    const h = this.history;
    const apply = () => {
      const sheet = this._getSheet();
      const insertion = findParentArray(sheet, id);
      if (!insertion) return;
      insertion.arr.splice(insertion.idx, 1);
    };
    if (h) h.run('Delete comment', apply); else apply();

    this.refresh();
    this.onChange();
  }

  _setCommentColor(id, color) {
    const c = this._findElement(id);
    if (!c || kindOf(c) !== COMMENT) return;
    if (c.color === color) return;

    const h = this.history;
    const apply = () => { c.color = color; };
    if (h) h.run('Comment color', apply); else apply();

    this.refresh();
    this.onChange();
  }

  _commitCommentText(el) {
    const id = +el.dataset.commentText;
    const c = this._findElement(id);
    if (!c || kindOf(c) !== COMMENT) return;

    const newText = el.textContent || '';
    if (c.text === newText) return;

    const h = this.history;
    const apply = () => { c.text = newText; };
    if (h) h.run('Edit comment', apply); else apply();

    this.onChange();
  }

  // ============================================================
  // REFERENCE RENAMING
  // ============================================================

  _renameParamRefs(oldName, newName, paramType, restrict) {
    const sheet = this._getSheet();
    if (!sheet || !oldName || !newName || oldName === newName) return;

    let touched = 0;

    const visit = (items, defs) => {
      for (const item of items || []) {
        const def = defs.get(item.type);
        if (!def) continue;
        for (const p of (def.params || [])) {
          if (p.type !== paramType) continue;
          if (!item.params || item.params[p.id] !== oldName) continue;
          if (restrict && !restrict(item, p)) continue;
          item.params[p.id] = newName;
          touched++;
        }
      }
    };

    walkEvents(sheet.events || [], (ev) => {
      visit(ev.conditions, registry.conditions);
      visit(ev.actions, registry.actions);
    });

    if (touched > 0) {
      this.refresh();
      this.onChange();
    }
  }

  renameObjectRefs(oldName, newName) {
    this._renameParamRefs(oldName, newName, 'target');
    this._renameParamRefs(oldName, newName, 'prefab');
  }

  renameGlobalVarRefs(oldName, newName) {
    this._renameParamRefs(oldName, newName, 'varname');
  }

  renameInstanceVarRefs(objName, oldName, newName) {
    this._renameParamRefs(oldName, newName, 'instvar', (item) => {
      const t = item.params && item.params.target;
      return t === objName || t === '*' || t == null || t === '';
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _findEvent(id, list) {
    const sheet = this._getSheet();
    list = list || sheet.events;
    for (const el of list) {
      if (kindOf(el) !== EVENT) {
        if (el.children && el.children.length) {
          const f = this._findEvent(id, el.children);
          if (f) return f;
        }
        continue;
      }
      if (el.id === id) return el;
      if (el.children && el.children.length) {
        const f = this._findEvent(id, el.children);
        if (f) return f;
      }
    }
    return null;
  }

  _findElement(id) {
    const sheet = this._getSheet();
    if (!sheet) return null;
    return findElement(sheet, id);
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