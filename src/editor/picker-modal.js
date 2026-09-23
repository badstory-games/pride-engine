export class PickerModal {
  constructor() {
    this.el       = document.getElementById('picker-modal');
    this.titleEl  = this.el.querySelector('.picker-title');
    this.searchEl = this.el.querySelector('.picker-search');
    this.listEl   = this.el.querySelector('.picker-list');
    this.closeBtn = this.el.querySelector('.modal-close');

    this.onSelect = null;
    this.items = [];

    this.searchEl.addEventListener('input', () => this._render());
    this.closeBtn.addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.listEl.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (!item) return;
      const id = item.dataset.id;
      const cb = this.onSelect;
      this.close();
      if (cb) cb(id);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
  }

  open(title, items, onSelect) {
    this.titleEl.textContent = title;
    this.items = items;
    this.onSelect = onSelect;
    this.searchEl.value = '';
    this.el.hidden = false;
    this._render();
    this.searchEl.focus();
  }

  close() {
    this.el.hidden = true;
    this.onSelect = null;
  }

  get isOpen() { return !this.el.hidden; }

  _render() {
    const q = this.searchEl.value.trim().toLowerCase();
    const filtered = q
      ? this.items.filter((it) =>
          it.id.toLowerCase().includes(q) ||
          (it.label || '').toLowerCase().includes(q) ||
          (it.category || '').toLowerCase().includes(q))
      : this.items;

    const groups = new Map();
    for (const it of filtered) {
      const cat = it.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(it);
    }

    this.listEl.innerHTML = '';
    if (groups.size === 0) {
      this.listEl.innerHTML = '<div class="picker-empty">Ничего не найдено</div>';
      return;
    }

    for (const [cat, arr] of groups) {
      const catEl = document.createElement('div');
      catEl.className = 'picker-category';
      catEl.textContent = cat;
      this.listEl.appendChild(catEl);

      for (const it of arr) {
        const row = document.createElement('button');
        row.className = 'picker-item';
        row.dataset.id = it.id;
        row.innerHTML = `
          <span class="picker-item-label">${it.label || it.id}</span>
          <span class="picker-item-id">${it.id}</span>
        `;
        this.listEl.appendChild(row);
      }
    }
  }
}