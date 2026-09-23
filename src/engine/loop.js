export class GameLoop {
  constructor(update, render, fpsCallback) {
    this.update = update;
    this.render = render;
    this.fpsCallback = fpsCallback;

    this.accumulator = 0;
    this.fixedDt = 1 / 60;
    this.lastTime = 0;
    this.running = false;

    this.frameCount = 0;
    this.fpsTime = 0;
    this._tick = this.tick.bind(this);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    if (!this.running) return;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (dt > 0.25) dt = 0.25;

    this.accumulator += dt;

    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    this.render(dt);

    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      if (this.fpsCallback) this.fpsCallback(this.frameCount);
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    requestAnimationFrame(this._tick);
  }
}