import { World } from './physics/world.js';
import { BodyType, ShapeType } from './physics/body.js';

const DEFAULT_PHYSICS = {
  enabled: false,
  type: 'dynamic',
  shape: 'box',
  density: 1,
  friction: 0.5,
  restitution: 0.2,
  radius: 32,
};

export function defaultPhysics() {
  return { ...DEFAULT_PHYSICS };
}

export class PhysicsBridge {
  constructor(scene, opts = {}) {
    this.scene = scene;

    this.gravityX = opts.gravityX ?? 0;
    this.gravityY = opts.gravityY ?? 980;

    this.world = new World({
      gravityX: this.gravityX,
      gravityY: this.gravityY,
      iterations: 8,
      cellSize: 64,
    });

    this.running = false;
    this.paused = false;

    this.snapshot = null;

    /** @type {{bodyIndex:number, objectId:number, obj:object, _dead:boolean}[]} */
    this.mapping = [];

    // Пул mapping-записей.
    this._mappingPool = [];
    this._mappingPoolMax = 512;

    // Отложенная чистка mapping — аналогично scene.flush(),
    // но только для записей, чьи объекты удалены.
    this._hasDeadMappings = false;
  }

  get bodiesCount() {
    return this.world.bodies.count;
  }

  setGravity(gx, gy) {
    if (this.gravityX === gx && this.gravityY === gy) return;
    this.gravityX = gx;
    this.gravityY = gy;
    this.world.gravityX = gx;
    this.world.gravityY = gy;
  }

  start() {
    if (this.running) return;

    this.snapshot = structuredClone(this.scene.toJSON());

    this.world.clear();
    this.mapping.length = 0;
    this._mappingPool.length = 0;
    this._hasDeadMappings = false;

    for (const obj of this.scene.objects) {
      if (obj._dead) continue;
      if (obj.template) continue;
      this._addBody(obj);
    }

    this.running = true;
    this.paused = false;
  }

  _acquireMapping() {
    return this._mappingPool.length > 0
      ? this._mappingPool.pop()
      : { bodyIndex: 0, objectId: 0, obj: null, _dead: false };
  }

  _releaseMapping(m) {
    m.bodyIndex = 0;
    m.objectId  = 0;
    m.obj       = null;
    m._dead     = false;
    if (this._mappingPool.length < this._mappingPoolMax) {
      this._mappingPool.push(m);
    }
  }

  _addBody(obj) {
    const ph = obj.physics;
    if (!ph || !ph.enabled) return null;

    const cx = obj.x + obj.width  / 2;
    const cy = obj.y + obj.height / 2;

    const isCircle = ph.shape === 'circle';
    const radius = isCircle
      ? (ph.radius || Math.min(obj.width, obj.height) / 2)
      : 0;

    const bodyType = ph.type === 'static'    ? BodyType.STATIC
                   : ph.type === 'kinematic' ? BodyType.KINEMATIC
                   : BodyType.DYNAMIC;

    const idx = this.world.createBody({
      type: bodyType,
      shape: isCircle ? ShapeType.CIRCLE : ShapeType.AABB,
      x: cx, y: cy,
      halfW: obj.width  / 2,
      halfH: obj.height / 2,
      radius,
      density: ph.density ?? 1,
      friction: ph.friction ?? 0.5,
      restitution: ph.restitution ?? 0.2,
      userId: obj.id,
    });

    const m = this._acquireMapping();
    m.bodyIndex = idx;
    m.objectId  = obj.id;
    m.obj       = obj;
    m._dead     = false;
    this.mapping.push(m);
    return idx;
  }

  spawnBodyFor(obj) {
    if (!this.running) return null;
    if (!obj || obj._dead || obj.template) return null;
    return this._addBody(obj);
  }

  destroyBodyFor(objId) {
    if (!this.running) return;
    const map = this.mapping;
    for (let i = 0; i < map.length; i++) {
      const m = map[i];
      if (m.objectId === objId && !m._dead) {
        m._dead = true;
        const bi = m.bodyIndex;
        if (bi >= 0 && bi < this.world.bodies.count) {
          this.world.bodies.flags[bi] = 0;
        }
        this._hasDeadMappings = true;
        return;
      }
    }
  }

  /**
   * Один проход: живые mapping-записи сдвигаются влево, мёртвые —
   * в пул. Вызывается из update ДО scene.flush(), чтобы ни одна
   * mapping-запись не держала ссылку на объект, который вот-вот
   * вернётся в пул Scene.
   */
  flushMappings() {
    if (!this._hasDeadMappings) return;
    const map = this.mapping;
    let w = 0;
    for (let i = 0; i < map.length; i++) {
      const m = map[i];
      if (m._dead) this._releaseMapping(m);
      else         map[w++] = m;
    }
    map.length = w;
    this._hasDeadMappings = false;
  }

  pause() {
    if (this.running) this.paused = true;
  }

  resume() {
    if (this.running) this.paused = false;
  }

  stop() {
    if (!this.running) return;

    if (this.snapshot) {
      this.scene.fromJSON(this.snapshot);
    }

    this.world.clear();
    this.mapping.length = 0;
    this._mappingPool.length = 0;
    this._hasDeadMappings = false;
    this.snapshot = null;
    this.running = false;
    this.paused = false;
  }

  sync() {
    if (!this.running) return;
    const store = this.world.bodies;
    const m = this.mapping;

    for (let i = 0; i < m.length; i++) {
      const bodyIndex = m[i].bodyIndex;
      const obj = m[i].obj;
      if (!obj || obj._dead) continue;
      if (store.flags[bodyIndex] === 0) continue;
      obj.x = store.x[bodyIndex] - obj.width  / 2;
      obj.y = store.y[bodyIndex] - obj.height / 2;
    }
  }

  step(dt) {
    if (!this.running || this.paused) return;
    this.world.step(dt);
    this.sync();
  }
}