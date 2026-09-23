export function hitTest(obj, wx, wy) {
  if (!obj.visible) return false;

  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dx = wx - cx;
  const dy = wy - cy;

  // обратный поворот: world → local
  const cos = Math.cos(-obj.rotation);
  const sin = Math.sin(-obj.rotation);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;

  return Math.abs(lx) <= obj.width / 2 && Math.abs(ly) <= obj.height / 2;
}

/** Ищет самый верхний объект под точкой (по порядку отрисовки). */
export function pickTopmost(scene, wx, wy) {
  const sorted = scene.getSortedByLayer();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (hitTest(sorted[i], wx, wy)) return sorted[i];
  }
  return null;
}

/** Объекты, чей центр попал в прямоугольник (простая, предсказуемая логика). */
export function objectsInRect(scene, x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);

  const result = [];
  for (const obj of scene.objects) {
    if (!obj.visible) continue;
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) result.push(obj);
  }
  return result;
}