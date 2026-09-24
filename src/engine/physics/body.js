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
 *
 * Ёмкость растёт удвоением при переполнении: 2048 → 4096 → 8192 → ...
 * Рост — редкое событие (обычно один-два раза за сеанс), поэтому
 * копирование через TypedArray#set приемлемо.
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

  /**
   * Удваивает capacity. Все буферы заменяются на новые,
   * старые данные копируются через TypedArray#set.
   * Ссылка на сам BodyStore не меняется — все, кто держит
   * `world.bodies`, автоматически видят новые массивы.
   */
  _grow() {
    const newCap = this.capacity * 2;

    const growF32 = (a) => { const n = new Float32Array(newCap); n.set(a); return n; };
    const growU8  = (a) => { const n = new Uint8Array(newCap);  n.set(a); return n; };

    this.x   = growF32(this.x);
    this.y   = growF32(this.y);
    this.vx  = growF32(this.vx);
    this.vy  = growF32(this.vy);

    this.angle    = growF32(this.angle);
    this.angularV = growF32(this.angularV);

    this.invMass     = growF32(this.invMass);
    this.invInertia  = growF32(this.invInertia);
    this.restitution = growF32(this.restitution);
    this.friction    = growF32(this.friction);

    this.halfW  = growF32(this.halfW);
    this.halfH  = growF32(this.halfH);
    this.radius = growF32(this.radius);

    this.shape = growU8(this.shape);
    this.btype = growU8(this.btype);
    this.flags = growU8(this.flags);

    // userId — заполняем -1, потом копируем старые значения поверх.
    const nextUserId = new Int32Array(newCap);
    nextUserId.fill(-1);
    nextUserId.set(this.userId);
    this.userId = nextUserId;

    this.capacity = newCap;
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
    if (this.count >= this.capacity) this._grow();

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
      const mass = Math.max(1e-4, density * area * 0.001);
      this.invMass[i]    = 1 / mass;
      this.invInertia[i] = 0;
    }

    this.flags[i] = 1;
    this.userId[i] = userId;

    return i;
  }

  clear() {
    this.count = 0;
    // capacity сохраняем — не сжимаемся, чтобы не мигать туда-сюда.
  }
}