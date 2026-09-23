import { defaultPhysics } from '../engine/physics-bridge.js';

export class Scene {
  constructor() {
    this.objects = [];
    this.layers = [
      { id: 'default', name: 'Layer 1', visible: true },
    ];
    this.nextId = 1;
    this.nextLayerId = 1;
  }

  // ---------- Layers ----------
  addLayer(name) {
    const id = 'layer_' + (this.nextLayerId++);
    const layer = { id, name: name || `Layer ${this.layers.length + 1}`, visible: true };
    this.layers.push(layer);
    return layer;
  }

  getLayer(id) {
    return this.layers.find((l) => l.id === id) || null;
  }

  /** Индекс слоя в массиве = порядок отрисовки (0 — самый нижний). */
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
      x: 0, y: 0,
      width: 64, height: 64,
      rotation: 0,
      opacity: 1,
      layerId: this.layers[0].id,
      textureId: null,
      visible: true,
      properties: {},
      physics: defaultPhysics(),
      ...partial,
    };
    this.objects.push(obj);
    return obj;
  }

  remove(id) {
    const i = this.objects.findIndex((o) => o.id === id);
    if (i >= 0) this.objects.splice(i, 1);
  }

  get(id) {
    return this.objects.find((o) => o.id === id) || null;
  }

  getSortedByLayer() {
    const idx = new Map();
    this.layers.forEach((l, i) => idx.set(l.id, i));
    const arr = this.objects
      .map((o, i) => ({ o, i }))
      .filter((e) => {
        const l = this.getLayer(e.o.layerId);
        return l && l.visible && e.o.visible;
      });
    arr.sort((a, b) => {
      const la = idx.get(a.o.layerId) ?? 0;
      const lb = idx.get(b.o.layerId) ?? 0;
      return (la - lb) || (a.i - b.i);
    });
    return arr.map((e) => e.o);
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
      : [{ id: 'default', name: 'Layer 1', visible: true }];
    this.nextId   = data.nextId || (this.objects.reduce((m, o) => Math.max(m, o.id), 0) + 1);
    this.nextLayerId = data.nextLayerId || (this.layers.length + 1);

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
      if (!o.physics) o.physics = defaultPhysics();
    }
  }
}