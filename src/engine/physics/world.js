import { BodyStore, BodyType, ShapeType } from './body.js';
import { SpatialHash } from './broadphase.js';
import {
  collideAABBvsAABB,
  collideCirclevsCircle,
  collideCirclevsAABB,
} from './collision.js';
import { solveWorld } from './solver.js';

export class World {
  constructor(opts = {}) {
    this.gravityX = opts.gravityX ?? 0;
    this.gravityY = opts.gravityY ?? 980;
    this.iterations = opts.iterations ?? 8;
    this.linearDamping = opts.linearDamping ?? 0.999;

    this.bodies = new BodyStore(opts.capacity ?? 2048);
    this.broadphase = new SpatialHash(opts.cellSize ?? 64);

    /** Активные манифолды текущего шага (переиспользуются из пула). */
    this.collisions = [];

    /** Опциональный callback: (bodyA, bodyB, manifold) => void. */
    this.onCollision = null;

    this._manifoldPool = [];
    this._manifoldCount = 0;
  }

  createBody(desc) {
    return this.bodies.add(desc);
  }

  clear() {
    this.bodies.clear();
    this.broadphase.clear();
    this.collisions.length = 0;
    this._manifoldCount = 0;
  }

  _acquireManifold() {
    if (this._manifoldCount < this._manifoldPool.length) {
      return this._manifoldPool[this._manifoldCount++];
    }
    const m = { a: 0, b: 0, nx: 0, ny: 0, penetration: 0, cx: 0, cy: 0 };
    this._manifoldPool.push(m);
    this._manifoldCount++;
    return m;
  }

  _releaseManifold() {
    this._manifoldCount--;
  }

  step(dt) {
    const store = this.bodies;
    const n = store.count;

    // --- 1) Integrate velocities ---
    const gx = this.gravityX * dt;
    const gy = this.gravityY * dt;
    const damp = this.linearDamping;

    for (let i = 0; i < n; i++) {
      if (store.btype[i] !== BodyType.DYNAMIC) continue;
      store.vx[i] = (store.vx[i] + gx) * damp;
      store.vy[i] = (store.vy[i] + gy) * damp;
    }

    // --- 2) Broad phase ---
    this.broadphase.clear();
    for (let i = 0; i < n; i++) {
      const shape = store.shape[i];
      const hw = shape === ShapeType.CIRCLE ? store.radius[i] : store.halfW[i];
      const hh = shape === ShapeType.CIRCLE ? store.radius[i] : store.halfH[i];
      this.broadphase.insert(
        i,
        store.x[i] - hw, store.y[i] - hh,
        store.x[i] + hw, store.y[i] + hh
      );
    }

    // --- 3) Narrow phase ---
    this.collisions.length = 0;
    this._manifoldCount = 0;

    const pairs = this.broadphase.computePairs();
    for (let p = 0; p < pairs.length; p += 2) {
      const a = pairs[p];
      const b = pairs[p + 1];

      if (store.btype[a] === BodyType.STATIC &&
          store.btype[b] === BodyType.STATIC) continue;
      if (store.flags[a] === 0 || store.flags[b] === 0) continue;

      const m = this._acquireManifold();
      if (this._testPair(a, b, m)) {
        this.collisions.push(m);
      } else {
        this._releaseManifold();
      }
    }

    // --- 4) Solver ---
    solveWorld(this);

    // --- 5) Integrate positions ---
    for (let i = 0; i < n; i++) {
      if (store.btype[i] !== BodyType.DYNAMIC) continue;
      store.x[i] += store.vx[i] * dt;
      store.y[i] += store.vy[i] * dt;
    }

    // --- 6) Callbacks ---
    if (this.onCollision) {
      for (let i = 0; i < this.collisions.length; i++) {
        const m = this.collisions[i];
        this.onCollision(m.a, m.b, m);
      }
    }
  }

  _testPair(a, b, out) {
    const store = this.bodies;
    const sa = store.shape[a];
    const sb = store.shape[b];

    if (sa === ShapeType.AABB && sb === ShapeType.AABB) {
      return collideAABBvsAABB(store, a, b, out);
    }

    if (sa === ShapeType.CIRCLE && sb === ShapeType.CIRCLE) {
      return collideCirclevsCircle(store, a, b, out);
    }

    if (sa === ShapeType.CIRCLE && sb === ShapeType.AABB) {
      // circle=a, box=b — нормаль от круга к боксу
      return collideCirclevsAABB(store, a, b, out);
    }

    if (sa === ShapeType.AABB && sb === ShapeType.CIRCLE) {
      // circle=b, box=a — считаем как (circle, box), потом разворачиваем
      if (!collideCirclevsAABB(store, b, a, out)) return false;
      // out.a = b(circle), out.b = a(box) — переставляем и разворачиваем нормаль
      out.a = a;
      out.b = b;
      out.nx = -out.nx;
      out.ny = -out.ny;
      return true;
    }

    return false;
  }
}