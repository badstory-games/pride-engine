/**
 * Профайлер реальной нагрузки.
 *
 * Записывает frameMs / updateMs / renderMs на каждый кадр в течение
 * указанного интервала. По завершении возвращает статистику:
 *   - avg / min / max / p50 / p95 / p99 по каждой метрике
 *   - топ-10 худших кадров
 *   - число «провалов» (кадров > 33.34 ms — ниже 30 FPS)
 *
 * Не рисует UI сам — этим занимается profiler-modal. Профайлер только
 * собирает данные и предоставляет отчёт в удобном виде.
 *
 * capture() вызывается из PerfOverlay.tick() каждый кадр — запись
 * идёт в реальном времени, независимо от того, идёт ли игра.
 */
export class Profiler {
  constructor() {
    this.recording = false;
    this.samples = [];       // { t, frame, update, render }
    this.duration = 5.0;     // сек
    this.startTime = 0;

    /** @type {((progress: number, total: number) => void) | null} */
    this.onProgress = null;
    /** @type {((report: object) => void) | null} */
    this.onFinish = null;

    this._lastNotify = 0;
  }

  get isRecording() { return this.recording; }

  start(duration = 5.0) {
    if (this.recording) return;
    this.recording = true;
    this.samples.length = 0;
    this.startTime = performance.now();
    this.duration = duration;
    this._lastNotify = this.startTime;
  }

  /**
   * Вызывается из PerfOverlay каждый кадр (после измерений).
   * Если запись не идёт — no-op.
   */
  capture(frameMs, updateMs, renderMs) {
    if (!this.recording) return;

    const now = performance.now();
    const t = (now - this.startTime) / 1000;

    this.samples.push({
      t,
      frame:  frameMs,
      update: updateMs,
      render: renderMs,
    });

    // Уведомляем UI не чаще 10 раз в секунду.
    if (this.onProgress && now - this._lastNotify >= 100) {
      this._lastNotify = now;
      this.onProgress(t, this.duration);
    }

    if (t >= this.duration) {
      this._finish();
    }
  }

  /** Принудительная остановка без отчёта (например, отмена). */
  cancel() {
    if (!this.recording) return;
    this.recording = false;
    this.samples.length = 0;
  }

  _finish() {
    this.recording = false;
    const report = buildReport(this.samples, this.duration);
    if (this.onFinish) this.onFinish(report);
  }
}

// ============================================================
// Статистика
// ============================================================

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p))
  );
  return sorted[idx];
}

function statOf(samples, key) {
  if (samples.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }
  const arr = samples.map((s) => s[key]);
  const sorted = [...arr].sort((a, b) => a - b);

  let sum = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of arr) {
    sum += v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }

  return {
    avg: sum / arr.length,
    min: mn,
    max: mx,
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function buildReport(samples, duration) {
  const frame  = statOf(samples, 'frame');
  const update = statOf(samples, 'update');
  const render = statOf(samples, 'render');

  // Средний FPS за запись.
  const avgFps = frame.avg > 0 ? 1000 / frame.avg : 0;

  // Худшие кадры: сортируем копию по frameMs по убыванию.
  const worst = [...samples]
    .sort((a, b) => b.frame - a.frame)
    .slice(0, 10);

  // Провалы: кадры, у которых frameMs > 33.34 (ниже 30 FPS).
  const hitches = samples.filter((s) => s.frame > 33.34).length;

  return {
    duration,
    sampleCount: samples.length,
    avgFps,
    frame,
    update,
    render,
    worst,
    hitches,
    samples: [...samples],
  };
}