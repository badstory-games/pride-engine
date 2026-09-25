import { defaultPhysics } from '../engine/physics-bridge.js';

export class Scene {
  constructor() {
    this.objects = [];
    this.layers = [
      { id: 'default', name: 'Слой 1', visible: true },
    ];
    this.nextId = 1;
    this.nextLayerId = 1;

    // Hot-path буферы: переиспользуются, не сохранять между вызовами.
    this._renderBuf = [];
    this._layerIdx = new Map();
    this._layerIdxDirty = true;
  }

  // ---------- Layers ----------
  addLayer(name) {
    const id = 'layer_' + (this.nextLayerId++);
    const layer = { id, name: name || `Слой ${this.layers.length + 1}`, visible: true };
    this.layers.push(layer);
    this._layerIdxDirty = true;
    return layer;
  }

  getLayer(id) {
    return this.layers.find((l) => l.id === id) || null;
  }

  layerIndex(id) {
    const i = this.layers.findIndex((l) => l.id === id);
    return i < 0 ? 0 : i;
  }

  moveLayer(id, dir) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const j = i + dir;
    if (j < 0 || j >= this.layers.length) return false;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
    this._layerIdxDirty = true;
    return true;
  }

  removeLayer(id) {
    if (this.layers.length <= 1) return false;
    const fallback = this.layers.find((l) => l.id !== id);
    if (!fallback) return false;
    for (const o of this.objects) {
      if (o.layerId === id) o.layerId = fallback.id;
    }
    this.layers = this.layers.filter((l) => l.id !== id);
    this._layerIdxDirty = true;
    return true;
  }

  objectsOnLayer(id) {
    return this.objects.filter((o) => o.layerId === id);
  }

  // ---------- Objects ----------
  add(partial) {
    const obj = {
      id: this.nextId++,
      type: 'sprite',
      name: 'Объект',
      x: 0, y: 0,
      width: 64, height: 64,
      rotation: 0,
      opacity: 1,
      layerId: this.layers[0].id,
      textureId: null,
      visible: true,
      template: false,
      properties: {},
      physics: defaultPhysics(),
      ...partial,
    };
    if (!obj.properties || typeof obj.properties !== 'object') obj.properties = {};
    if (obj.template === undefined) obj.template = false;
    this.objects.push(obj);
    return obj;
  }

  /**
   * Создаёт копию объекта-шаблона в точке (x, y) — координаты это
   * ЦЕНТР нового объекта. Возвращает новый объект или null.
   *
   * Клон наследует все свойства шаблона (текстуру, физику, variables),
   * но помечается template: false.
   */
  spawnFromTemplate(template, x, y) {
    if (!template) return null;
    const clone = structuredClone(template);
    delete clone.id;
    clone.x = x - template.width  / 2;
    clone.y = y - template.height / 2;
    clone.template = false;
    return this.add(clone);
  }

  remove(id) {
    const i = this.objects.findIndex((o) => o.id === id);
    if (i >= 0) this.objects.splice(i, 1);
  }

  get(id) {
    return this.objects.find((o) => o.id === id) || null;
  }

  getSortedByLayer() {
    if (this._layerIdxDirty) {
      this._layerIdx.clear();
      for (let i = 0; i < this.layers.length; i++) {
        this._layerIdx.set(this.layers[i].id, i);
      }
      this._layerIdxDirty = false;
    }

    const idx    = this._layerIdx;
    const layers = this.layers;
    const buf    = this._renderBuf;
    buf.length = 0;

    for (const o of this.objects) {
      if (!o.visible) continue;
      const li = idx.get(o.layerId);
      if (li === undefined) continue;
      if (!layers[li].visible) continue;
      buf.push(o);
    }

    buf.sort((a, b) => idx.get(a.layerId) - idx.get(b.layerId));
    return buf;
  }

  // ---------- Serialize ----------
  toJSON() {
    return {
      objects: this.objects,
      layers: this.layers,
      nextId: this.nextId,
      nextLayerId: this.nextLayerId,
    };
  }

  fromJSON(data) {
    this.objects  = Array.isArray(data.objects) ? data.objects : [];
    this.layers   = Array.isArray(data.layers) && data.layers.length
      ? data.layers
      : [{ id: 'default', name: 'Слой 1', visible: true }];
    this.nextId   = data.nextId || (this.objects.reduce((m, o) => Math.max(m, o.id), 0) + 1);
    this.nextLayerId = data.nextLayerId || (this.layers.length + 1);
    this._layerIdxDirty = true;

    const fallback = this.layers[0].id;
    for (const o of this.objects) {
      if (!o.layerId) {
        o.layerId = (typeof o.layer === 'number' && this.layers[o.layer])
          ? this.layers[o.layer].id
          : fallback;
      }
      delete o.layer;
      if (o.visible === undefined) o.visible = true;
      if (o.opacity === undefined) o.opacity = 1;
      if (o.rotation === undefined) o.rotation = 0;
      if (!o.name) o.name = 'Объект';
      if (!o.physics) o.physics = defaultPhysics();
      if (!o.properties || typeof o.properties !== 'object') o.properties = {};
      if (o.template === undefined) o.template = false;
    }
  }
}