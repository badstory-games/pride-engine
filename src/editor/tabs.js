export class Tabs {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.tabs = [...container.querySelectorAll('[data-tab]')];
    this.active = 'layout';

    for (const t of this.tabs) {
      t.addEventListener('click', () => this.select(t.dataset.tab));
    }
    this._refresh();
  }

  select(id) {
    if (this.active === id) return;
    this.active = id;
    this._refresh();
    if (this.onChange) this.onChange(id);
  }

  _refresh() {
    for (const t of this.tabs) {
      t.classList.toggle('active', t.dataset.tab === this.active);
    }
  }
}