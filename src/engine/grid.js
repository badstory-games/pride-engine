export function drawGrid(batch, camera, W, H, gridSize = 32) {
  const halfW = W / 2 / camera.zoom;
  const halfH = H / 2 / camera.zoom;

  const minX = camera.x - halfW;
  const maxX = camera.x + halfW;
  const minY = camera.y - halfH;
  const maxY = camera.y + halfH;

  const startX = Math.floor(minX / gridSize) * gridSize;
  const startY = Math.floor(minY / gridSize) * gridSize;

  const thickness = 1 / camera.zoom;
  const r = 1, g = 1, b = 1, a = 0.07;

  for (let x = startX; x <= maxX; x += gridSize) {
    batch.drawColor(x, minY, thickness, maxY - minY, r, g, b, a);
  }
  for (let y = startY; y <= maxY; y += gridSize) {
    batch.drawColor(minX, y, maxX - minX, thickness, r, g, b, a);
  }
}