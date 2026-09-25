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

    /**
     * Сколько тиков пара считается «той же самой» после потери контакта.
     * 20 тиков ≈ 333 мс при 60 Hz. Переживает jitter narrow phase,
     * не переоткрывая OnCollision при микро-разрывах контакта.
     */
    this.contactGrace = opts.contactGrace ?? 20;

    this.bodies = new BodyStore(opts.capacity ?? 2048);
    this.broadphase = new SpatialHash(opts.cellSize ?? 64);

    /** Все контакты текущего шага. */
    this.collisions = [];

    /** Только по-настоящему новые пары (для OnCollision). */
    this.newCollisions = [];

    this.onCollision = null;

    this._manifoldPool = [];
    this._manifoldCount = 0;

    this._pairLastSeen = new Map();
    this._tickCounter  = 0;
  }

  createBody(desc) {
    return this.bodies.add(desc);
  }

  clear() {
    this.bodies.clear();
    this.broadphase.clear();
    this.collisions.length = 0;
    this.newCollisions.length = 0;
    this._manifoldCount = 0;
    this._pairLastSeen.clear();
    this._tickCounter = 0;
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

    this._tickCounter++;

    // --- 1) Integrate velocities ---
    const gx = this.gravityX * dt;
    const gy = this.gravityY * dt;
    const damp = this.linearDamping;

    for (let i = 0; i < n; i++) {
      if (store.flags[i] === 0) continue;          // мёртвое тело
      if (store.btype[i] !== BodyType.DYNAMIC) continue;
      store.vx[i] = (store.vx[i] + gx) * damp;
      store.vy[i] = (store.vy[i] + gy) * damp;
    }

    // --- 2) Broad phase ---
    this.broadphase.clear();
    for (let i = 0; i < n; i++) {
      if (store.flags[i] === 0) continue;          // мёртвое тело
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

    // --- 3b) Edge-детект с grace period ---
    this.newCollisions.length = 0;
    const tick = this._tickCounter;
    const grace = this.contactGrace;

    for (let i = 0; i < this.collisions.length; i++) {
      const m = this.collisions[i];
      const lo = m.a < m.b ? m.a : m.b;
      const hi = m.a < m.b ? m.b : m.a;
      const key = lo * 0x100000 + hi;

      const last = this._pairLastSeen.get(key);
      if (last === undefined || (tick - last) > grace) {
        this.newCollisions.push(m);
      }
      this._pairLastSeen.set(key, tick);
    }

    if ((tick & 63) === 0) {
      const cutoff = tick - grace * 4;
      for (const [k, t] of this._pairLastSeen) {
        if (t < cutoff) this._pairLastSeen.delete(k);
      }
    }

    // --- 4) Solver ---
    solveWorld(this);

    // --- 5) Integrate positions ---
    for (let i = 0; i < n; i++) {
      if (store.flags[i] === 0) continue;          // мёртвое тело
      if (store.btype[i] !== BodyType.DYNAMIC) continue;
      store.x[i] += store.vx[i] * dt;
      store.y[i] += store.vy[i] * dt;
    }

    // --- 6) Callbacks ---
    if (this.onCollision) {
      for (let i = 0; i < this.newCollisions.length; i++) {
        const m = this.newCollisions[i];
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
      return collideCirclevsAABB(store, a, b, out);
    }

    if (sa === ShapeType.AABB && sb === ShapeType.CIRCLE) {
      if (!collideCirclevsAABB(store, b, a, out)) return false;
      out.a = a;
      out.b = b;
      out.nx = -out.nx;
      out.ny = -out.ny;
      return true;
    }

    return false;
  }
}