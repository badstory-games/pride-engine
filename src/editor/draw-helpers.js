export function drawLine(batch, x1, y1, x2, y2, thickness, r, g, b, a) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;

  const angle = Math.atan2(dy, dx);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  batch.drawRotated(cx, cy, len, thickness, angle, 0, 0, 1, 1, r, g, b, a);
}

/** Углы ориентированного bbox (TL, TR, BR, BL) в мировых координатах. */
export function objectCorners(obj) {
  const hw = obj.width / 2;
  const hh = obj.height / 2;
  const cx = obj.x + hw;
  const cy = obj.y + hh;
  const cos = Math.cos(obj.rotation);
  const sin = Math.sin(obj.rotation);
  const local = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];

  const out = new Array(4);
  for (let i = 0; i < 4; i++) {
    const lx = local[i][0];
    const ly = local[i][1];
    out[i] = {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    };
  }
  return out;
}