/**
 * Плавающий оверлей производительности.
 * Домен — редактор, в экспорт не попадает.
 *
 * Использование:
 *   const perf = new PerfOverlay(containerEl);
 *   // в update():
 *   perf.beginUpdate(); ... ; perf.endUpdate();
 *   // в render():
 *   perf.beginRender(); ... ; perf.endRender();
 *   perf.set({ drawCalls, vertices, objects, bodies, collisions });
 *   // раз в кадр — начало кадра и обновление UI:
 *   perf.beginFrame();
 *   perf.tick();
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
    this._frameStart  = 0;
    this._updateStart = 0;
    this._renderStart = 0;

    this._extras = {
      drawCalls: 0, vertices: 0,
      objects: 0, bodies: 0, collisions: 0,
    };

    // Роллинг-окно frame time для стабильного FPS.
    this._samples = new Float32Array(60);
    this._sampleIdx = 0;
    this._sampleLen = 0;
    this._lastUiUpdate = 0;
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

  beginFrame()  { this._frameStart  = performance.now(); }
  beginUpdate() { this._updateStart = performance.now(); }
  endUpdate()   { this._updateMs = performance.now() - this._updateStart; }
  beginRender() { this._renderStart = performance.now(); }
  endRender()   { this._renderMs = performance.now() - this._renderStart; }

  /** Дополнительные счётчики (draw calls, vertex count и т.д.). */
  set(extras) {
    Object.assign(this._extras, extras);
  }

  /** Вызывается в конце кадра — обновляет FPS и, раз в 200 мс, UI. */
  tick() {
    const now = performance.now();
    this._frameMs = now - this._frameStart;

    this._samples[this._sampleIdx] = this._frameMs;
    this._sampleIdx = (this._sampleIdx + 1) % this._samples.length;
    if (this._sampleLen < this._samples.length) this._sampleLen++;

    if (now - this._lastUiUpdate >= 200) {
      this._lastUiUpdate = now;
      this._renderUi(now);
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