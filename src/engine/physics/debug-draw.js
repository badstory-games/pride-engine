import { ShapeType, BodyType } from './body.js';

/**
 * Рисует тела и контакты через SpriteBatch.
 * Использует системную текстуру __white через drawColor.
 */
export function drawPhysicsDebug(batch, world, camera, opts = {}) {
  const store = world.bodies;
  const n = store.count;

  const thickness = 2 / camera.zoom;

  for (let i = 0; i < n; i++) {
    const static_ = store.btype[i] === BodyType.STATIC;
    const r = static_ ? 0.35 : 0.95;
    const g = static_ ? 0.65 : 0.55;
    const b = static_ ? 1.00 : 0.20;
    const a = 1;

    if (store.shape[i] === ShapeType.CIRCLE) {
      drawCircleOutline(batch, store.x[i], store.y[i], store.radius[i], thickness, r, g, b, a);
    } else {
      const hw = store.halfW[i];
      const hh = store.halfH[i];
      const x0 = store.x[i] - hw, y0 = store.y[i] - hh;
      const x1 = store.x[i] + hw, y1 = store.y[i] + hh;

      batch.drawColor(x0, y0, hw * 2, hh * 2, r, g, b, 0.18);

      seg(batch, x0, y0, x1, y0, thickness, r, g, b, a);
      seg(batch, x1, y0, x1, y1, thickness, r, g, b, a);
      seg(batch, x1, y1, x0, y1, thickness, r, g, b, a);
      seg(batch, x0, y1, x0, y0, thickness, r, g, b, a);
    }
  }

  if (opts.drawContacts !== false) {
    const s = 3 / camera.zoom;
    for (let i = 0; i < world.collisions.length; i++) {
      const m = world.collisions[i];
      batch.drawColor(m.cx - s, m.cy - s, s * 2, s * 2, 1, 0.2, 0.2, 0.95);
    }
  }
}

function drawCircleOutline(batch, cx, cy, r, thickness, rr, gg, bb, aa) {
  const N = 20;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2;
    const a1 = ((k + 1) / N) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    seg(batch, x0, y0, x1, y1, thickness, rr, gg, bb, aa);
  }
}

function seg(batch, x1, y1, x2, y2, t, r, g, b, a) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ang = Math.atan2(dy, dx);
  batch.drawRotatedColor((x1 + x2) / 2, (y1 + y2) / 2, len, t, ang, r, g, b, a);
}