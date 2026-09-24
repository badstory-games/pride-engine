import { registry } from '../engine/events/registry.js';

/**
 * Компактный popover для быстрого выбора условия/действия.
 * Открывается под кнопкой "+ if" / "+ do".
 */
export class EventPopover {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'es-popover';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this._onSelect = null;

    // Клик мимо — закрыть
    document.addEventListener('mousedown', (e) => {
      if (this.el.hidden) return;
      if (this.el.contains(e.target)) return;
      if (e.target.closest('[data-action="add-condition"], [data-action="add-action"]')) return;
      this.close();
    });

    // Клик по элементу — выбор
    this.el.addEventListener('click', (e) => {
      const item = e.target.closest('[data-type]');
      if (!item) return;
      const cb = this._onSelect;
      this.close();
      if (cb) cb(item.dataset.type);
    });

    this.el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
      if (e.code === 'Enter') {
        const item = [...this.el.querySelectorAll('.es-pop-item')]
          .find((el) => el.style.display !== 'none');
        if (item) {
          e.preventDefault();
          const cb = this._onSelect;
          this.close();
          if (cb) cb(item.dataset.type);
        }
      }
    });
  }

  open(anchorEl, kind, onSelect) {
    const map = kind === 'conditions' ? registry.conditions : registry.actions;
    const items = map.all();

    const groups = new Map();
    for (const it of items) {
      const cat = it.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(it);
    }

    let html = `<input type="text" class="es-pop-search" placeholder="Поиск…">`;
    html += `<div class="es-pop-list">`;
    for (const [cat, arr] of groups) {
      html += `<div class="es-pop-cat" data-cat="${cat}">${cat}</div>`;
      for (const it of arr) {
        html += `<button class="es-pop-item" data-type="${it.id}">${it.label}</button>`;
      }
    }
    html += `</div>`;
    this.el.innerHTML = html;

    const r = anchorEl.getBoundingClientRect();
    this.el.style.left = Math.max(8, r.left) + 'px';
    this.el.style.top  = (r.bottom + 4) + 'px';
    this.el.hidden = false;

    this._onSelect = onSelect;
    const search = this.el.querySelector('.es-pop-search');
    search.focus();

    // Сбрасываем фильтр от прошлого открытия: пустая строка → все видны.
    this._filter('');

    search.addEventListener('input', () => this._filter(search.value));
  }

  _filter(q) {
    q = q.trim().toLowerCase();

    for (const item of this.el.querySelectorAll('.es-pop-item')) {
      const text = item.textContent.toLowerCase();
      const type = item.dataset.type.toLowerCase();
      const match = !q || text.includes(q) || type.includes(q);
      item.style.display = match ? '' : 'none';
    }

    for (const cat of this.el.querySelectorAll('.es-pop-cat')) {
      let next = cat.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains('es-pop-cat')) {
        if (next.classList.contains('es-pop-item') && next.style.display !== 'none') {
          hasVisible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      cat.style.display = hasVisible ? '' : 'none';
    }
  }

  close() {
    this.el.hidden = true;
    this._onSelect = null;
  }

  get isOpen() { return !this.el.hidden; }
}