import { registry } from '../engine/events/registry.js';

export class EventPalette {
  constructor(container, onAdd) {
    this.container = container;
    this.onAdd = onAdd;

    container.innerHTML = `
      <div class="pal-section" data-kind="conditions">
        <h4>Условия</h4>
        <input type="text" class="pal-search" placeholder="Поиск…">
        <div class="pal-list"></div>
      </div>
      <div class="pal-section" data-kind="actions">
        <h4>Действия</h4>
        <input type="text" class="pal-search" placeholder="Поиск…">
        <div class="pal-list"></div>
      </div>
    `;

    for (const section of container.querySelectorAll('.pal-section')) {
      const search = section.querySelector('.pal-search');
      search.addEventListener('input', () => this._renderSection(section));
      this._renderSection(section);
    }

    container.addEventListener('dblclick', (e) => {
      const item = e.target.closest('[data-type]');
      if (!item) return;
      if (this.onAdd) this.onAdd(item.dataset.kind, item.dataset.type);
    });
  }

  _renderSection(section) {
    const kind = section.dataset.kind;
    const q = section.querySelector('.pal-search').value.trim().toLowerCase();
    const map = kind === 'conditions' ? registry.conditions : registry.actions;
    const items = map.all()
      .filter((it) => !q
        || it.label.toLowerCase().includes(q)
        || it.id.toLowerCase().includes(q)
        || (it.category || '').toLowerCase().includes(q));

    const listEl = section.querySelector('.pal-list');
    listEl.innerHTML = '';

    const groups = new Map();
    for (const it of items) {
      const cat = it.category || 'Прочее';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(it);
    }

    for (const [cat, arr] of groups) {
      const catEl = document.createElement('div');
      catEl.className = 'pal-cat';
      catEl.textContent = cat;
      listEl.appendChild(catEl);

      for (const it of arr) {
        const el = document.createElement('div');
        el.className = 'pal-item';
        el.draggable = true;
        el.dataset.kind = kind;
        el.dataset.type = it.id;
        el.title = it.id;
        el.innerHTML = `<span class="pal-item-label">${it.label}</span>`;
        listEl.appendChild(el);
      }
    }
  }

  attachDnD() {
    this.container.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.pal-item');
      if (!item) return;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-es-add', JSON.stringify({
        kind: item.dataset.kind,
        type: item.dataset.type,
      }));
      item.classList.add('dragging');
    });
    this.container.addEventListener('dragend', (e) => {
      const item = e.target.closest('.pal-item');
      if (item) item.classList.remove('dragging');
    });
  }
}