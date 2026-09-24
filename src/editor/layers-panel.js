import { icon } from './icons.js';
import { Modal } from './modal.js';


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
        <h3>Слои</h3>
        <button id="btn-add-layer" class="topbtn">
          <svg class="icon"><use href="#icon-plus"/></svg><span>Добавить</span>
        </button>
      </header>
      <div id="layers-list" class="layers-list"></div>
    `;
    this.listEl = this.container.querySelector('#layers-list');
    this.container.querySelector('#btn-add-layer')
      .addEventListener('click', () => {
        const h = this.editor.history;
        const apply = () => { this.scene.addLayer(); };
        if (h) h.run('Добавить слой', apply); else apply();
        this.editor.onChange();
      });
  }

  refresh() {
    const sig = this.scene.layers.map((l) =>
      `${l.id}:${l.name}:${l.visible ? 1 : 0}:${this.scene.objectsOnLayer(l.id).length}`
    ).join('|');

    if (sig === this._lastSig) return;
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
        <button class="layer-vis" data-action="toggle" title="Видимость">${layer.visible ? icon('eye') : icon('eye-off')}</button>
        <span class="layer-name" data-action="select" title="Клик — выделить объекты слоя, двойной — переименовать">${layer.name}</span>
        <span class="layer-count">${count}</span>
        <button class="layer-btn" data-action="up"   title="Выше"  ${isTop ? 'disabled' : ''}>${icon('chevron-up')}</button>
        <button class="layer-btn" data-action="down" title="Ниже"  ${isBottom ? 'disabled' : ''}>${icon('chevron-down')}</button>
        <button class="layer-btn layer-del" data-action="del" title="Удалить" ${this.scene.layers.length <= 1 ? 'disabled' : ''}>${icon('x')}</button>
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

    const h = this.editor.history;

    switch (action) {
      case 'toggle': {
        const apply = () => {
          const l = this.scene.getLayer(layerId);
          if (l) l.visible = !l.visible;
        };
        if (h) h.run('Видимость слоя', apply); else apply();
        break;
      }
      case 'select': {
        const objs = this.scene.objectsOnLayer(layerId);
        this.editor.selectMany(objs.map((o) => o.id), false);
        return;
      }
      case 'up': {
        const apply = () => this.scene.moveLayer(layerId, +1);
        if (h) h.run('Слой выше', apply); else apply();
        break;
      }
      case 'down': {
        const apply = () => this.scene.moveLayer(layerId, -1);
        if (h) h.run('Слой ниже', apply); else apply();
        break;
      }
      case 'del':
        this._confirmDelete(layerId);
        return;   // editor.onChange() вызовется после подтверждения
    }
    this.editor.onChange();
  }

  async _confirmDelete(layerId) {
    const l = this.scene.getLayer(layerId);
    const ok = await Modal.confirm({
      title: 'Удалить слой',
      message: l
        ? `Слой «${l.name}» будет удалён. Объекты перейдут на нижний слой.`
        : 'Слой будет удалён. Объекты перейдут на нижний слой.',
      okText: 'Удалить',
      cancelText: 'Отмена',
      danger: true,
    });
    if (!ok) return;

    const h = this.editor.history;
    const apply = () => this.scene.removeLayer(layerId);
    if (h) h.run('Удалить слой', apply); else apply();
    this.editor.onChange();
  }

  async _onDblClick(e) {
    const nameEl = e.target.closest('.layer-name');
    if (!nameEl) return;

    e.preventDefault();
    e.stopPropagation();

    const row = nameEl.closest('.layer-row');
    const l = this.scene.getLayer(row.dataset.layerId);
    if (!l) return;

    const newName = await Modal.prompt({
      title: 'Имя слоя',
      defaultValue: l.name,
      placeholder: 'Например: Фон',
      okText: 'Переименовать',
      cancelText: 'Отмена',
    });
    if (newName === null) return;

    const trimmed = String(newName).trim();
    if (!trimmed || trimmed === l.name) return;

    const h = this.editor.history;
    const apply = () => { l.name = trimmed; };
    if (h) h.run('Переименовать слой', apply); else apply();
    this.editor.onChange();
  }
}