/**
 * Narrow phase. Все функции пишут результат в `out` и возвращают true/false.
 * Нормаль в out направлена ОТ a К b.
 * Контактная точка — приблизительная (для 3.1 достаточно).
 */

export function collideAABBvsAABB(store, a, b, out) {
  const ax = store.x[a], ay = store.y[a];
  const bx = store.x[b], by = store.y[b];
  const aHW = store.halfW[a], aHH = store.halfH[a];
  const bHW = store.halfW[b], bHH = store.halfH[b];

  const dx = bx - ax;
  const dy = by - ay;

  const ox = (aHW + bHW) - Math.abs(dx);
  if (ox <= 0) return false;

  const oy = (aHH + bHH) - Math.abs(dy);
  if (oy <= 0) return false;

  let nx, ny, pen, cx, cy;

  if (ox < oy) {
    // Разрешаем по X — грань вертикальная
    nx = dx < 0 ? -1 : 1;
    ny = 0;
    pen = ox;

    // X: середина между обращёнными рёбрами
    //   ребро A в сторону B: ax + nx * aHW
    //   ребро B в сторону A: bx - nx * bHW
    cx = (ax + nx * aHW + bx - nx * bHW) * 0.5;

    // Y: центр вертикального перекрытия
    const yMin = Math.max(ay - aHH, by - bHH);
    const yMax = Math.min(ay + aHH, by + bHH);
    cy = (yMin + yMax) * 0.5;
  } else {
    // Разрешаем по Y — грань горизонтальная
    nx = 0;
    ny = dy < 0 ? -1 : 1;
    pen = oy;

    cy = (ay + ny * aHH + by - ny * bHH) * 0.5;

    const xMin = Math.max(ax - aHW, bx - bHW);
    const xMax = Math.min(ax + aHW, bx + bHW);
    cx = (xMin + xMax) * 0.5;
  }

  out.a = a; out.b = b;
  out.nx = nx; out.ny = ny;
  out.penetration = pen;
  out.cx = cx;
  out.cy = cy;
  return true;
}

export function collideCirclevsCircle(store, a, b, out) {
  const dx = store.x[b] - store.x[a];
  const dy = store.y[b] - store.y[a];
  const r  = store.radius[a] + store.radius[b];
  const d2 = dx * dx + dy * dy;

  if (d2 >= r * r) return false;

  // совпадающие центры: искусственная нормаль вверх
  if (d2 < 1e-12) {
    out.a = a; out.b = b;
    out.nx = 0; out.ny = -1;
    out.penetration = r;
    out.cx = store.x[a];
    out.cy = store.y[a];
    return true;
  }

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const pen = r - d;

  out.a = a; out.b = b;
  out.nx = nx; out.ny = ny;
  out.penetration = pen;
  out.cx = store.x[a] + nx * (store.radius[a] - pen * 0.5);
  out.cy = store.y[a] + ny * (store.radius[a] - pen * 0.5);
  return true;
}

/**
 * Круг A против AABB B.
 * Нормаль в out — от круга к AABB.
 */
export function collideCirclevsAABB(store, ca, ab, out) {
  const cx = store.x[ca], cy = store.y[ca], cr = store.radius[ca];
  const bx = store.x[ab], by = store.y[ab];
  const bHW = store.halfW[ab], bHH = store.halfH[ab];

  const closestX = Math.max(bx - bHW, Math.min(cx, bx + bHW));
  const closestY = Math.max(by - bHH, Math.min(cy, by + bHH));

  const dx = closestX - cx;
  const dy = closestY - cy;
  const d2 = dx * dx + dy * dy;

  if (d2 > cr * cr) return false;

  // Центр круга внутри AABB: выталкиваем по минимальной оси
  if (d2 < 1e-12) {
    const toLeft   = Math.abs(cx - (bx - bHW));
    const toRight  = Math.abs((bx + bHW) - cx);
    const toTop    = Math.abs(cy - (by - bHH));
    const toBottom = Math.abs((by + bHH) - cy);
    const m = Math.min(toLeft, toRight, toTop, toBottom);

    let outX = 0, outY = 0;
    if (m === toLeft)       outX = -1;
    else if (m === toRight) outX =  1;
    else if (m === toTop)   outY = -1;
    else                    outY =  1;

    out.a = ca; out.b = ab;
    out.nx = -outX; out.ny = -outY;
    out.penetration = cr + m;
    out.cx = cx; out.cy = cy;
    return true;
  }

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const pen = cr - d;

  out.a = ca; out.b = ab;
  out.nx = nx; out.ny = ny;
  out.penetration = pen;
  out.cx = closestX;
  out.cy = closestY;
  return true;
}