import { drawLine, objectCorners } from './draw-helpers.js';

export function drawOverlay(batch, editor, camera) {
  for (const id of editor.selection) {
    const obj = editor.scene.get(id);
    if (!obj) continue;
    outlineObject(batch, obj, 1, 0.65, 0.15, 1, 2 / camera.zoom);
  }

  if (editor.hovered != null && !editor.selection.has(editor.hovered)) {
    const obj = editor.scene.get(editor.hovered);
    if (obj) outlineObject(batch, obj, 0.45, 0.8, 1, 0.85, 1.5 / camera.zoom);
  }

  if (editor.box) {
    const { x0, y0, x1, y1 } = normalizeRect(editor.box);
    batch.draw(x0, y0, x1 - x0, y1 - y0, 0, 0, 1, 1, 0.3, 0.6, 1, 0.15);
    const t = 1 / camera.zoom;
    drawLine(batch, x0, y0, x1, y0, t, 0.5, 0.8, 1, 1);
    drawLine(batch, x1, y0, x1, y1, t, 0.5, 0.8, 1, 1);
    drawLine(batch, x1, y1, x0, y1, t, 0.5, 0.8, 1, 1);
    drawLine(batch, x0, y1, x0, y0, t, 0.5, 0.8, 1, 1);
  }

  if (editor.pendingRect) {
    const { x0, y0, x1, y1 } = normalizeRect(editor.pendingRect);
    batch.draw(x0, y0, x1 - x0, y1 - y0, 0, 0, 1, 1, 1, 0.7, 0.2, 0.25);
    const t = 1 / camera.zoom;
    drawLine(batch, x0, y0, x1, y0, t, 1, 0.85, 0.35, 1);
    drawLine(batch, x1, y0, x1, y1, t, 1, 0.85, 0.35, 1);
    drawLine(batch, x1, y1, x0, y1, t, 1, 0.85, 0.35, 1);
    drawLine(batch, x0, y1, x0, y0, t, 1, 0.85, 0.35, 1);
  }
}

function outlineObject(batch, obj, r, g, b, a, thickness) {
  const c = objectCorners(obj);
  for (let i = 0; i < 4; i++) {
    const p0 = c[i];
    const p1 = c[(i + 1) % 4];
    drawLine(batch, p0.x, p0.y, p1.x, p1.y, thickness, r, g, b, a);
  }
}

function normalizeRect(r) {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}