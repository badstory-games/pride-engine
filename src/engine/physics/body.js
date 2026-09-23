export const ShapeType = {
  AABB:   0,
  CIRCLE: 1,
};

export const BodyType = {
  STATIC:    0,  // invMass = 0, не двигается физикой
  DYNAMIC:   1,  // полная симуляция
  KINEMATIC: 2,  // invMass = 0, но velocity задаётся извне
};

/**
 * Structure-of-Arrays хранилище тел.
 * Все поля — в типизированных массивах, hot path не аллоцирует.
 * Вместимость фиксирована; при переполнении — исключение (можно расширить, но не сейчас).
 */
export class BodyStore {
  constructor(capacity = 2048) {
    this.capacity = capacity;
    this.count = 0;

    // Кинематика
    this.x   = new Float32Array(capacity);
    this.y   = new Float32Array(capacity);
    this.vx  = new Float32Array(capacity);
    this.vy  = new Float32Array(capacity);

    // Зарезервировано под 3.4 (OBB)
    this.angle    = new Float32Array(capacity);
    this.angularV = new Float32Array(capacity);

    // Массы и материалы
    this.invMass    = new Float32Array(capacity);
    this.invInertia = new Float32Array(capacity);
    this.restitution= new Float32Array(capacity);
    this.friction   = new Float32Array(capacity);

    // Геометрия
    this.halfW  = new Float32Array(capacity);
    this.halfH  = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);

    // Типы
    this.shape = new Uint8Array(capacity);
    this.btype = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);  // bit0 = активен

    // Связь с внешним миром (sceneObject.id)
    this.userId = new Int32Array(capacity);
    this.userId.fill(-1);
  }

  add({
    type = BodyType.DYNAMIC,
    shape = ShapeType.AABB,
    x = 0, y = 0,
    vx = 0, vy = 0,
    halfW = 16, halfH = 16,
    radius = 16,
    density = 1,
    restitution = 0.2,
    friction = 0.4,
    userId = -1,
  } = {}) {
    if (this.count >= this.capacity) {
      throw new Error(`BodyStore overflow: capacity=${this.capacity}`);
    }

    const i = this.count++;

    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.angle[i] = 0;
    this.angularV[i] = 0;

    this.halfW[i]  = halfW;
    this.halfH[i]  = halfH;
    this.radius[i] = radius;

    this.shape[i] = shape;
    this.btype[i] = type;
    this.restitution[i] = restitution;
    this.friction[i] = friction;

    if (type === BodyType.STATIC || type === BodyType.KINEMATIC) {
      this.invMass[i]    = 0;
      this.invInertia[i] = 0;
    } else {
      const area = (shape === ShapeType.CIRCLE)
        ? Math.PI * radius * radius
        : (halfW * 2) * (halfH * 2);
      // 0.001 — "кг на пиксель²": при density=1 тело 40×40 весит ~1.6,
      // импульс 800 даёт Δv ≈ 500 px/s, что даёт прыжок ~128 px.
      const mass = Math.max(1e-4, density * area * 0.001);
      this.invMass[i]    = 1 / mass;
      this.invInertia[i] = 0;  // 3.4
    }

    this.flags[i] = 1;
    this.userId[i] = userId;

    return i;
  }

  clear() {
    this.count = 0;
  }
}