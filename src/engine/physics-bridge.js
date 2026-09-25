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

    /**
     * Полный снимок сцены (scene.toJSON()) на момент старта.
     * При Stop восстанавливаем всё — включая объекты, удалённые или
     * созданные в процессе Play.
     */
    this.snapshot = null;

    /** @type {{bodyIndex:number, objectId:number, obj:object}[]} */
    this.mapping = [];
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

    for (const obj of this.scene.objects) {
      if (obj.template) continue;   // шаблоны не участвуют в физике
      this._addBody(obj);
    }

    this.running = true;
    this.paused = false;
  }

  /**
   * Добавляет физическое тело для объекта. Используется и в start(),
   * и при динамическом спавне во время Play.
   */
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

    this.mapping.push({ bodyIndex: idx, objectId: obj.id, obj });
    return idx;
  }

  /** Публичный метод для action'а SpawnObject. */
  spawnBodyFor(obj) {
    if (!this.running) return null;
    if (obj.template) return null;
    return this._addBody(obj);
  }

  /**
   * Помечает тело мёртвым (flags = 0) и убирает связку из mapping.
   * Реальная чистка буфера не нужна: world.step пропускает тела с flags=0.
   */
  destroyBodyFor(objId) {
    if (!this.running) return;
    const i = this.mapping.findIndex((m) => m.objectId === objId);
    if (i < 0) return;
    const { bodyIndex } = this.mapping[i];
    if (bodyIndex >= 0 && bodyIndex < this.world.bodies.count) {
      this.world.bodies.flags[bodyIndex] = 0;
    }
    this.mapping.splice(i, 1);
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
      // Полное восстановление сцены из снимка.
      this.scene.fromJSON(this.snapshot);
    }

    this.world.clear();
    this.mapping.length = 0;
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
      // Не двигаем мёртвые тела (не должно случаться, но перестраховка).
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