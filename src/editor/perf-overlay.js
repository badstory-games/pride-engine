/**
 * Плавающий оверлей производительности.
 * Домен — редактор, в экспорт не попадает.
 *
 * onFrame — необязательный колбэк, вызывается в конце tick() с точными
 * значениями текущего кадра. Используется профайлером.
 */
export class PerfOverlay {
  constructor(container) {
    this.el = document.createElement('div');
    this.el.className = 'perf-overlay';
    this.el.hidden = true;
    container.appendChild(this.el);

    /** @type {Record<string, HTMLSpanElement>} */
    this._values = {};
    this._buildRows([
      'FPS', 'Frame', 'Update', 'Render',
      '|',
      'Draws', 'Verts', 'Objects', 'Bodies', 'Collisions',
    ]);

    this._frameMs  = 0;
    this._updateMs = 0;
    this._renderMs = 0;
    this._updateStart = 0;
    this._renderStart = 0;

    this._extras = {
      drawCalls: 0, vertices: 0,
      objects: 0, bodies: 0, collisions: 0,
    };

    this._samples = new Float32Array(60);
    this._sampleIdx = 0;
    this._sampleLen = 0;
    this._lastUiUpdate = 0;

    this._lastTickTime = 0;

    /** @type {((frameMs: number, updateMs: number, renderMs: number) => void) | null} */
    this.onFrame = null;
  }

  _buildRows(labels) {
    for (const label of labels) {
      if (label === '|') {
        const sep = document.createElement('div');
        sep.className = 'perf-sep';
        this.el.appendChild(sep);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'perf-row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.textContent = '—';
      row.append(l, v);
      this.el.appendChild(row);
      this._values[label] = v;
    }
  }

  // ---- тайминги ----

  beginUpdate() { this._updateStart = performance.now(); }
  endUpdate()   { this._updateMs = performance.now() - this._updateStart; }
  beginRender() { this._renderStart = performance.now(); }
  endRender()   { this._renderMs = performance.now() - this._renderStart; }

  // ---- публичные getters ----

  get updateMs() { return this._updateMs; }
  get renderMs() { return this._renderMs; }
  get frameMs()  { return this._frameMs; }
  get extras()   { return this._extras; }

  /** Дополнительные счётчики (draw calls, vertex count и т.д.). */
  set(extras) {
    Object.assign(this._extras, extras);
  }

  /**
   * Вызывается в конце кадра. Frame time = разница между двумя tick().
   * UI обновляется раз в 200 мс.
   */
  tick() {
    const now = performance.now();

    if (this._lastTickTime > 0) {
      this._frameMs = now - this._lastTickTime;

      this._samples[this._sampleIdx] = this._frameMs;
      this._sampleIdx = (this._sampleIdx + 1) % this._samples.length;
      if (this._sampleLen < this._samples.length) this._sampleLen++;
    }
    this._lastTickTime = now;

    if (now - this._lastUiUpdate >= 200) {
      this._lastUiUpdate = now;
      this._renderUi();
    }

    // Профайлер подписывается сюда — получает точные значения кадра.
    // Ошибку глотаем, чтобы сбой профайлера не ронял игровой цикл.
    if (this.onFrame) {
      try { this.onFrame(this._frameMs, this._updateMs, this._renderMs); }
      catch { /* ignore */ }
    }
  }

  _renderUi() {
    let sum = 0;
    for (let i = 0; i < this._sampleLen; i++) sum += this._samples[i];
    const avg = this._sampleLen > 0 ? sum / this._sampleLen : 0;
    const fps = avg > 0 ? 1000 / avg : 0;

    const e = this._extras;
    this._set('FPS',        fps.toFixed(0));
    this._set('Frame',      this._frameMs.toFixed(2) + ' ms');
    this._set('Update',     this._updateMs.toFixed(2) + ' ms');
    this._set('Render',     this._renderMs.toFixed(2) + ' ms');
    this._set('Draws',      String(e.drawCalls));
    this._set('Verts',      String(e.vertices));
    this._set('Objects',    String(e.objects));
    this._set('Bodies',     String(e.bodies));
    this._set('Collisions', String(e.collisions));
  }

  _set(label, value) {
    const el = this._values[label];
    if (el && el.textContent !== value) el.textContent = value;
  }

  toggle() { this.el.hidden = !this.el.hidden; }
  get isVisible() { return !this.el.hidden; }
}