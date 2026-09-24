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
  /**
   * @param {Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.gravityX=0]
   * @param {number} [opts.gravityY=980]
   */
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

    /** Снимок сцены для отката при Stop. */
    this.snapshot = null;

    /**
     * Тело ↔ объект сцены.
     * obj — прямая ссылка, чтобы sync() не звал scene.get() (он O(n)).
     * @type {{bodyIndex:number, objectId:number, obj:object}[]}
     */
    this.mapping = [];
  }

  get bodiesCount() {
    return this.world.bodies.count;
  }

  /**
   * Обновляет гравитацию на лету. Можно звать и во время Play.
   * Идемпотентно: если значения те же — ничего не делает.
   */
  setGravity(gx, gy) {
    if (this.gravityX === gx && this.gravityY === gy) return;
    this.gravityX = gx;
    this.gravityY = gy;
    this.world.gravityX = gx;
    this.world.gravityY = gy;
  }

  start() {
    if (this.running) return;

    this.snapshot = this.scene.objects.map((o) => ({
      id:       o.id,
      x:        o.x,
      y:        o.y,
      rotation: o.rotation,
      opacity:  o.opacity,
      visible:  o.visible,
    }));

    this.world.clear();
    this.mapping.length = 0;

    for (const obj of this.scene.objects) {
      const ph = obj.physics;
      if (!ph || !ph.enabled) continue;

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
    }

    this.running = true;
    this.paused = false;
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
      const byId = new Map(this.snapshot.map((s) => [s.id, s]));
      for (const obj of this.scene.objects) {
        const s = byId.get(obj.id);
        if (s) {
          obj.x        = s.x;
          obj.y        = s.y;
          obj.rotation = s.rotation;
          obj.opacity  = s.opacity;
          obj.visible  = s.visible;
        }
      }
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