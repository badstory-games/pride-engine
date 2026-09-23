const SLOP = 0.5;        // допуск проникновения (px)
const PERCENT = 0.2;     // доля коррекции за шаг
const VEL_THRESHOLD = 1; // ниже этой скорости restitution игнорируется

/**
 * Sequential impulses.
 * Вызывается один раз на шаг физики — сам итерирует по контактам N раз.
 */
export function solveWorld(world) {
  const store = world.bodies;
  const collisions = world.collisions;
  const iterations = world.iterations;

  if (collisions.length === 0) return;

  // Velocity phase
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < collisions.length; i++) {
      solveVelocity(store, collisions[i]);
    }
  }

  // Position phase
  for (let i = 0; i < collisions.length; i++) {
    correctPosition(store, collisions[i]);
  }
}

function solveVelocity(store, m) {
  const a = m.a, b = m.b;
  const nx = m.nx, ny = m.ny;

  const invMassA = store.invMass[a];
  const invMassB = store.invMass[b];
  const invMassSum = invMassA + invMassB;
  if (invMassSum === 0) return;

  // Relative velocity along normal
  const rvx = store.vx[b] - store.vx[a];
  const rvy = store.vy[b] - store.vy[a];
  const vn = rvx * nx + rvy * ny;

  if (vn > 0) return;  // разлетаются

  // Restitution (только если скорость достаточно велика)
  let e = Math.min(store.restitution[a], store.restitution[b]);
  if (Math.abs(vn) < VEL_THRESHOLD) e = 0;

  // Нормальный импульс
  const jn = -(1 + e) * vn / invMassSum;

  store.vx[a] -= jn * nx * invMassA;
  store.vy[a] -= jn * ny * invMassA;
  store.vx[b] += jn * nx * invMassB;
  store.vy[b] += jn * ny * invMassB;

  // Friction (tangent = perpendicular to normal)
  const tx = -ny;
  const ty =  nx;

  const vtx = store.vx[b] - store.vx[a];
  const vty = store.vy[b] - store.vy[a];
  const vt  = vtx * tx + vty * ty;

  const jt = -vt / invMassSum;

  const mu = Math.sqrt(store.friction[a] * store.friction[b]);
  const maxFriction = jn * mu;
  const jtClamped = jt < -maxFriction ? -maxFriction
                  : jt >  maxFriction ?  maxFriction
                  : jt;

  store.vx[a] -= jtClamped * tx * invMassA;
  store.vy[a] -= jtClamped * ty * invMassA;
  store.vx[b] += jtClamped * tx * invMassB;
  store.vy[b] += jtClamped * ty * invMassB;
}

function correctPosition(store, m) {
  const pen = m.penetration - SLOP;
  if (pen <= 0) return;

  const a = m.a, b = m.b;
  const invMassA = store.invMass[a];
  const invMassB = store.invMass[b];
  const invMassSum = invMassA + invMassB;
  if (invMassSum === 0) return;

  const corr = PERCENT * pen / invMassSum;
  store.x[a] -= corr * m.nx * invMassA;
  store.y[a] -= corr * m.ny * invMassA;
  store.x[b] += corr * m.nx * invMassB;
  store.y[b] += corr * m.ny * invMassB;
}