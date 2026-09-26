import { defaultPhysics } from '../engine/physics-bridge.js';

/**
 * Сцена: слои + объекты.
 *
 * Пул объектов: удалённый объект не отдаётся сборщику мусора, а
 * сбрасывается и кладётся в _spareObjects. При следующем add() берём
 * оттуда — new Object() больше не вызывается на каждой пуле.
 *
 * Отложенное удаление: remove() помечает объект _dead и складывает id
 * в _deadIds. Реальная компакция массива — один проход в flush().
 * Это спасает от O(n) splice при массовых удалениях (очереди пуль).
 *
 * Пока объект _dead:
 *   - get() его не возвращает;
 *   - getSortedByLayer() его пропускает;
 *   - objectsOnLayer() его пропускает;
 *   - toJSON() его не сериализует.
 *
 * Внешний код, который напрямую ходит по scene.objects, должен
 * проверять !o._dead (см. helpers.js, param-defaults.js, event-sheet-panel.js).
 */
export class Scene {
  constructor() {
    this.objects = [];
    this.layers = [
      { id: 'default', name: 'Слой 1', visible: true },
    ];
    this.nextId = 1;
    this.nextLayerId = 1;

    // Hot-path буферы.
    this._renderBuf = [];
    this._layerIdx = new Map();
    this._layerIdxDirty = true;

    // Пул переиспользуемых JS-объектов. Ограничен сверху, чтобы
    // при экстремальных сценариях не держать память «на всякий случай».
    this._spareObjects = [];
    this._spareMax = 512;

    // Отложенные удаления.
    this._deadIds = new Set();
    this._hasDead = false;
  }

  markLayersDirty() { this._layerIdxDirty = true; }

  // ============================================================
  // Object pool
  // ============================================================

  _acquire() {
    return this._spareObjects.length > 0
      ? this._spareObjects.pop()
      : {};
  }

  _release(obj) {
    // Полный сброс полей. Перезапись вместо delete — дешевле и
    // сохраняет «shape» объекта для inline-кэшей V8.
    obj._dead     = false;
    obj.id        = 0;
    obj.type      = '';
    obj.name      = '';
    obj.x         = 0;
    obj.y         = 0;
    obj.width     = 0;
    obj.height    = 0;
    obj.rotation  = 0;
    obj.opacity   = 1;
    obj.layerId   = '';
    obj.textureId = null;
    obj.visible   = true;
    obj.template  = false;
    obj.properties = null;
    obj.physics    = null;

    if (this._spareObjects.length < this._spareMax) {
      this._spareObjects.push(obj);
    }
    // Если пул переполнен — объект уйдёт в GC, это нормально.
  }

  // ============================================================
  // Layers
  // ============================================================

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
      if (!o._dead && o.layerId === id) o.layerId = fallback.id;
    }
    this.layers = this.layers.filter((l) => l.id !== id);
    this._layerIdxDirty = true;
    return true;
  }

  objectsOnLayer(id) {
    const out = [];
    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (!o._dead && o.layerId === id) out.push(o);
    }
    return out;
  }

  // ============================================================
  // Objects
  // ============================================================

  add(partial) {
    const obj = this._acquire();

    // Значения по умолчанию — перезаписываются ниже, если пришли
    // в partial. Явная переборка полей (вместо Object.assign)
    // сохраняет форму объекта для V8.
    obj.id        = this.nextId++;
    obj.type      = 'sprite';
    obj.name      = 'Объект';
    obj.x         = 0;
    obj.y         = 0;
    obj.width     = 64;
    obj.height    = 64;
    obj.rotation  = 0;
    obj.opacity   = 1;
    obj.layerId   = this.layers[0].id;
    obj.textureId = null;
    obj.visible   = true;
    obj.template  = false;
    obj._dead     = false;

    obj.properties = {};
    obj.physics    = defaultPhysics();

    if (partial) {
      if (partial.type      !== undefined) obj.type      = partial.type;
      if (partial.name      !== undefined) obj.name      = partial.name;
      if (partial.x         !== undefined) obj.x         = partial.x;
      if (partial.y         !== undefined) obj.y         = partial.y;
      if (partial.width     !== undefined) obj.width     = partial.width;
      if (partial.height    !== undefined) obj.height    = partial.height;
      if (partial.rotation  !== undefined) obj.rotation  = partial.rotation;
      if (partial.opacity   !== undefined) obj.opacity   = partial.opacity;
      if (partial.layerId   !== undefined) obj.layerId   = partial.layerId;
      if (partial.textureId !== undefined) obj.textureId = partial.textureId;
      if (partial.visible   !== undefined) obj.visible   = partial.visible;
      if (partial.template  !== undefined) obj.template  = !!partial.template;

      if (partial.properties && typeof partial.properties === 'object') {
        obj.properties = partial.properties;
      }
      if (partial.physics && typeof partial.physics === 'object') {
        obj.physics = { ...defaultPhysics(), ...partial.physics };
      }
    }

    this.objects.push(obj);
    return obj;
  }

  spawnFromTemplate(template, x, y) {
    if (!template) return null;
    const clone = structuredClone(template);
    delete clone.id;
    delete clone._dead;
    clone.x = x - template.width  / 2;
    clone.y = y - template.height / 2;
    clone.template = false;
    return this.add(clone);
  }

  /**
   * Помечает объект удалённым. Реальная чистка — в flush().
   * Возвращает true, если объект был жив и пометка удалась.
   */
  remove(id) {
    const objs = this.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.id === id && !o._dead) {
        o._dead = true;
        this._deadIds.add(id);
        this._hasDead = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Один проход по массиву: живые сдвигаются влево, мёртвые уходят
   * в пул. Вызывается из update (до step/tick) и перед сериализацией.
   */
  flush() {
    if (!this._hasDead) return;

    const objs = this.objects;
    let w = 0;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o._dead) {
        this._release(o);
      } else {
        objs[w++] = o;
      }
    }
    objs.length = w;

    this._deadIds.clear();
    this._hasDead = false;
  }

  get(id) {
    const objs = this.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.id === id && !o._dead) return o;
    }
    return null;
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
      if (o._dead) continue;
      if (!o.visible) continue;
      const li = idx.get(o.layerId);
      if (li === undefined) continue;
      if (!layers[li].visible) continue;
      buf.push(o);
    }

    buf.sort((a, b) => idx.get(a.layerId) - idx.get(b.layerId));
    return buf;
  }

  // ============================================================
  // Serialize
  // ============================================================

  toJSON() {
    // Не полагаемся на то, что кто-то вызвал flush(). Формируем
    // чистый массив без _dead, чтобы это поле не попало в файл.
    const objs = [];
    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (o._dead) continue;
      const copy = { ...o };
      delete copy._dead;
      objs.push(copy);
    }
    return {
      objects: objs,
      layers: this.layers,
      nextId: this.nextId,
      nextLayerId: this.nextLayerId,
    };
  }

  fromJSON(data) {
    // Полный сброс — старые пул и отложенные удаления неактуальны.
    this._spareObjects.length = 0;
    this._deadIds.clear();
    this._hasDead = false;

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
      if (o._dead === undefined) o._dead = false; else o._dead = false;
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