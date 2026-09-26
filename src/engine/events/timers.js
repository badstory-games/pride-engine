/**
 * Именованные таймеры для event runtime.
 *
 * Каждый таймер — это { elapsed, running }. Значение растёт только
 * пока running = true. Остановка сохраняет значение, продолжение
 * возобновляет с него. Reset обнуляет значение, но не меняет
 * состояние (запущен / остановлен).
 *
 * Хранилище живёт на уровне runtime, сбрасывается при Play / Stop.
 * Используется условием TimerElapsed и действиями StartTimer и др.
 */
export class TimerStore {
  constructor() {
    /** @type {Map<string, {elapsed:number, running:boolean}>} */
    this.timers = new Map();
  }

  start(name) {
    let t = this.timers.get(name);
    if (!t) {
      t = { elapsed: 0, running: true };
      this.timers.set(name, t);
    } else {
      t.elapsed = 0;
      t.running = true;
    }
  }

  stop(name) {
    const t = this.timers.get(name);
    if (t) t.running = false;
  }

  resume(name) {
    const t = this.timers.get(name);
    if (t) t.running = true;
    else this.start(name);
  }

  reset(name) {
    const t = this.timers.get(name);
    if (t) t.elapsed = 0;
  }

  getElapsed(name) {
    const t = this.timers.get(name);
    return t ? t.elapsed : 0;
  }

  isRunning(name) {
    const t = this.timers.get(name);
    return t ? t.running : false;
  }

  clear() {
    this.timers.clear();
  }

  step(dt) {
    for (const t of this.timers.values()) {
      if (t.running) t.elapsed += dt;
    }
  }
}