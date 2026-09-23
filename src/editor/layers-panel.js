export class LayersPanel {
  constructor(container, editor, scene) {
    this.container = container;
    this.editor = editor;
    this.scene = scene;
    this._lastSig = null;

    container.addEventListener('click', (e) => this._onClick(e));
    container.addEventListener('dblclick', (e) => this._onDblClick(e));

    this.container.innerHTML = `
      <header class="layers-header">
        <h3>Layers</h3>
        <button id="btn-add-layer" class="topbtn">+ Add</button>
      </header>
      <div id="layers-list" class="layers-list"></div>
    `;
    this.listEl = this.container.querySelector('#layers-list');
    this.container.querySelector('#btn-add-layer')
      .addEventListener('click', () => {
        this.scene.addLayer();
        this.editor.onChange();
      });
  }

  /** Пересобирает DOM только если изменилась структура/имена/видимость/порядок/счётчики. */
  refresh() {
    const sig = this.scene.layers.map((l) =>
      `${l.id}:${l.name}:${l.visible ? 1 : 0}:${this.scene.objectsOnLayer(l.id).length}`
    ).join('|');

    if (sig === this._lastSig) return;   // ← ключевая строка
    this._lastSig = sig;

    this._rebuild();
  }

  _rebuild() {
    const layers = [...this.scene.layers].reverse();
    this.listEl.innerHTML = '';

    for (const layer of layers) {
      const idx      = this.scene.layerIndex(layer.id);
      const isTop    = idx === this.scene.layers.length - 1;
      const isBottom = idx === 0;
      const count    = this.scene.objectsOnLayer(layer.id).length;

      const row = document.createElement('div');
      row.className = 'layer-row';
      row.dataset.layerId = layer.id;
      row.innerHTML = `
        <button class="layer-vis" data-action="toggle" title="Visible">${layer.visible ? '👁' : '·'}</button>
        <span class="layer-name" data-action="select" title="Клик — выделить объекты слоя, двойной — переименовать">${layer.name}</span>
        <span class="layer-count">${count}</span>
        <button class="layer-btn" data-action="up"   title="Вверх"   ${isTop ? 'disabled' : ''}>↑</button>
        <button class="layer-btn" data-action="down" title="Вниз"    ${isBottom ? 'disabled' : ''}>↓</button>
        <button class="layer-btn layer-del" data-action="del" title="Удалить" ${this.scene.layers.length <= 1 ? 'disabled' : ''}>✕</button>
      `;
      this.listEl.appendChild(row);
    }
  }

  _onClick(e) {
    const row = e.target.closest('.layer-row');
    if (!row) return;
    const layerId = row.dataset.layerId;
    const action  = e.target.dataset.action;
    if (!action) return;

    switch (action) {
      case 'toggle': {
        const l = this.scene.getLayer(layerId);
        if (l) l.visible = !l.visible;
        break;
      }
      case 'select': {
        const objs = this.scene.objectsOnLayer(layerId);
        this.editor.selectMany(objs.map((o) => o.id), false);
        // выделение не влияет на панель слоёв — не дёргаем полный refresh
        return;
      }
      case 'up':   this.scene.moveLayer(layerId, +1); break;
      case 'down': this.scene.moveLayer(layerId, -1); break;
      case 'del':
        if (confirm('Удалить слой? Объекты перейдут на нижний.')) {
          this.scene.removeLayer(layerId);
        }
        break;
    }
    this.editor.onChange();
  }

  _onDblClick(e) {
    const nameEl = e.target.closest('.layer-name');
    if (!nameEl) return;

    e.preventDefault();
    e.stopPropagation();

    const row = nameEl.closest('.layer-row');
    const l = this.scene.getLayer(row.dataset.layerId);
    if (!l) return;

    const newName = prompt('Имя слоя:', l.name);
    if (newName && newName.trim()) {
      l.name = newName.trim();
      this.editor.onChange();
    }
  }
}