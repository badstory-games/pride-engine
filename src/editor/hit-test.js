export function hitTest(obj, wx, wy) {
  if (!obj.visible) return false;

  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dx = wx - cx;
  const dy = wy - cy;

  const cos = Math.cos(-obj.rotation);
  const sin = Math.sin(-obj.rotation);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;

  return Math.abs(lx) <= obj.width / 2 && Math.abs(ly) <= obj.height / 2;
}

export function pickTopmost(scene, wx, wy) {
  const sorted = scene.getSortedByLayer();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (hitTest(sorted[i], wx, wy)) return sorted[i];
  }
  return null;
}

/**
 * Выделяет объекты, чей мировой AABB пересекается с прямоугольником.
 * Для неповёрнутых — точное AABB-пересечение.
 * Для повёрнутых — пересечение по bounding box всех четырёх углов.
 */
export function objectsInRect(scene, x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);

  const result = [];
  for (const obj of scene.objects) {
    if (!obj.visible) continue;

    const b = objectBounds(obj);
    if (b.minX < maxX && b.maxX > minX &&
        b.minY < maxY && b.maxY > minY) {
      result.push(obj);
    }
  }
  return result;
}

function objectBounds(obj) {
  // Быстрый путь: без поворота
  if (!obj.rotation) {
    return {
      minX: obj.x,
      minY: obj.y,
      maxX: obj.x + obj.width,
      maxY: obj.y + obj.height,
    };
  }

  const hw = obj.width / 2;
  const hh = obj.height / 2;
  const cx = obj.x + hw;
  const cy = obj.y + hh;
  const cos = Math.cos(obj.rotation);
  const sin = Math.sin(obj.rotation);

  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  // Четыре угла (локальные координаты относительно центра)
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  for (let i = 0; i < 4; i++) {
    const lx = corners[i][0];
    const ly = corners[i][1];
    const wx = cx + lx * cos - ly * sin;
    const wy = cy + lx * sin + ly * cos;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }

  return { minX, minY, maxX, maxY };
}