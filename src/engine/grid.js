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
    batch.draw(x, minY, thickness, maxY - minY, 0, 0, 1, 1, r, g, b, a);
  }
  for (let y = startY; y <= maxY; y += gridSize) {
    batch.draw(minX, y, maxX - minX, thickness, 0, 0, 1, 1, r, g, b, a);
  }
}