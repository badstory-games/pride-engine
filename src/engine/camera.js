export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.1;
    this.maxZoom = 10;
  }

  worldToScreen(wx, wy, W, H) {
    return {
      x: (wx - this.x) * this.zoom + W / 2,
      y: (wy - this.y) * this.zoom + H / 2,
    };
  }

  screenToWorld(sx, sy, W, H) {
    return {
      x: (sx - W / 2) / this.zoom + this.x,
      y: (sy - H / 2) / this.zoom + this.y,
    };
  }

  zoomAt(sx, sy, delta, W, H) {
    const before = this.screenToWorld(sx, sy, W, H);
    const factor = Math.exp(-delta * 0.0015);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, W, H);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  writeMatrix(m, W, H) {
    const z = this.zoom;
    const kx =  (2 * z) / W;
    const ky = -(2 * z) / H;

    m[0] = kx; m[1] = 0;  m[2] = 0;  m[3] = 0;
    m[4] = 0;  m[5] = ky; m[6] = 0;  m[7] = 0;
    m[8] = 0;  m[9] = 0;  m[10] = 1; m[11] = 0;
    m[12] = -kx * this.x;
    m[13] = -ky * this.y;
    m[14] = 0;
    m[15] = 1;
  }
}