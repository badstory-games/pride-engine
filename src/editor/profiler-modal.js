import { icon } from './icons.js';
import { downloadText } from '../project/file-io.js';

/**
 * Модалка профайлера.
 *
 *   const modal = new ProfilerModal();
 *   modal.open({ duration: 5, onCancel: () => profiler.cancel() });
 *
 * Два состояния:
 *   - recording: прогресс-бар, кнопка «Отмена».
 *   - result: график и таблицы, кнопки «Копировать», «Сохранить», «Закрыть».
 *
 * Модалка не знает про Profiler — управляется методами setProgress()
 * и showReport().
 */
export class ProfilerModal {
  constructor() {
    this._el = null;
    this._onKey = this._onKey.bind(this);
    this._onCancel = null;
    this._state = 'idle';     // 'recording' | 'result'
    this._progress = { t: 0, total: 5 };
    this._report = null;

    this._canvas = null;
    this._bodyEl = null;
  }

  open({ duration = 5, onCancel = null } = {}) {
    if (this._el) this.close();

    this._state = 'recording';
    this._progress = { t: 0, total: duration };
    this._report = null;
    this._onCancel = onCancel;

    this._build();
    document.addEventListener('keydown', this._onKey, true);
  }

  close() {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._el.remove();
    this._el = null;
    this._canvas = null;
    this._bodyEl = null;
    this._report = null;
    this._onCancel = null;
    this._state = 'idle';
  }

  get isOpen() { return this._el !== null; }

  /** Вызывается профайлером каждые ~100 мс во время записи. */
  setProgress(t, total) {
    if (this._state !== 'recording') return;
    this._progress = { t, total };
    this._renderRecording();
  }

  /** Вызывается по завершении записи. */
  showReport(report) {
    if (!this._el) return;
    this._state = 'result';
    this._report = report;
    this._renderResult();
  }

  // ============================================================
  // Build
  // ============================================================

  _build() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop profiler-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'profiler-box';

    const header = document.createElement('div');
    header.className = 'profiler-header';
    header.innerHTML = `
      <h2 class="profiler-title">${icon('activity')}<span>Профайлер</span></h2>
      <button class="modal-close profiler-close" title="Закрыть (Esc)">${icon('x')}</button>
    `;
    box.appendChild(header);

    const body = document.createElement('div');
    body.className = 'profiler-body';
    box.appendChild(body);
    this._bodyEl = body;

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this._el = backdrop;

    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this._requestClose();
    });
    header.querySelector('.profiler-close')
      .addEventListener('click', () => this._requestClose());

    this._renderRecording();
  }

  // ============================================================
  // Recording state
  // ============================================================

  _renderRecording() {
    const { t, total } = this._progress;
    const pct = Math.min(100, (t / total) * 100);

    this._bodyEl.innerHTML = `
      <div class="profiler-recording">
        <div class="profiler-rec-status">Идёт запись…</div>
        <div class="profiler-rec-time">
          ${t.toFixed(1)}<span> / ${total.toFixed(1)} сек</span>
        </div>
        <div class="profiler-rec-bar">
          <div class="profiler-rec-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="profiler-rec-hint">
          Поиграйте в игру 5 секунд, чтобы получить реалистичную нагрузку.
        </div>
      </div>
      <div class="profiler-footer">
        <button type="button" class="modal-btn modal-btn-secondary" data-action="cancel">Отмена</button>
      </div>
    `;

    this._bodyEl.querySelector('[data-action="cancel"]')
      .addEventListener('click', () => this._requestClose());
  }

  _requestClose() {
    if (this._state === 'recording' && this._onCancel) {
      const cb = this._onCancel;
      this._onCancel = null;
      cb();
    }
    this.close();
  }

  // ============================================================
  // Result state
  // ============================================================

  _renderResult() {
    const r = this._report;
    if (!r) return;

    this._bodyEl.innerHTML = `
      <div class="profiler-result">
        <div class="profiler-summary">
          <div class="profiler-summary-item">
            <span class="profiler-summary-label">Кадров</span>
            <span class="profiler-summary-value">${r.sampleCount}</span>
          </div>
          <div class="profiler-summary-item">
            <span class="profiler-summary-label">Средний FPS</span>
            <span class="profiler-summary-value">${r.avgFps.toFixed(1)}</span>
          </div>
          <div class="profiler-summary-item">
            <span class="profiler-summary-label">Frame avg</span>
            <span class="profiler-summary-value">${r.frame.avg.toFixed(2)} ms</span>
          </div>
          <div class="profiler-summary-item">
            <span class="profiler-summary-label">p95</span>
            <span class="profiler-summary-value">${r.frame.p95.toFixed(2)} ms</span>
          </div>
          <div class="profiler-summary-item">
            <span class="profiler-summary-label">Провалы (&gt;33 ms)</span>
            <span class="profiler-summary-value ${r.hitches > 0 ? 'bad' : ''}">${r.hitches}</span>
          </div>
        </div>

        <div class="profiler-chart-wrap">
          <canvas class="profiler-chart"></canvas>
        </div>

        <div class="profiler-tables">
          <table class="profiler-table">
            <thead>
              <tr>
                <th>Метрика</th>
                <th>avg</th><th>min</th><th>max</th>
                <th>p50</th><th>p95</th><th>p99</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Frame, ms</td>
                ${statCells(r.frame)}
              </tr>
              <tr>
                <td>Update, ms</td>
                ${statCells(r.update)}
              </tr>
              <tr>
                <td>Render, ms</td>
                ${statCells(r.render)}
              </tr>
            </tbody>
          </table>

          <div class="profiler-worst">
            <h4>Худшие кадры</h4>
            <table class="profiler-table profiler-table-small">
              <thead>
                <tr>
                  <th>t, s</th>
                  <th>Frame, ms</th>
                  <th>Update</th>
                  <th>Render</th>
                </tr>
              </thead>
              <tbody>
                ${r.worst.map((s) => `
                  <tr>
                    <td>${s.t.toFixed(2)}</td>
                    <td>${s.frame.toFixed(2)}</td>
                    <td>${s.update.toFixed(2)}</td>
                    <td>${s.render.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="profiler-footer">
        <button type="button" class="modal-btn modal-btn-secondary" data-action="copy">Копировать</button>
        <button type="button" class="modal-btn modal-btn-secondary" data-action="save">Сохранить .txt</button>
        <button type="button" class="modal-btn modal-btn-primary" data-action="close">Закрыть</button>
      </div>
    `;

    // График рисуем после вставки в DOM — иначе у canvas нет размеров.
    const canvas = this._bodyEl.querySelector('.profiler-chart');
    this._canvas = canvas;
    requestAnimationFrame(() => {
      if (this._el && this._canvas) this._drawChart();
    });

    this._bodyEl.querySelector('[data-action="copy"]')
      .addEventListener('click', () => this._copyReport());
    this._bodyEl.querySelector('[data-action="save"]')
      .addEventListener('click', () => this._saveReport());
    this._bodyEl.querySelector('[data-action="close"]')
      .addEventListener('click', () => this.close());
  }

  _drawChart() {
    const canvas = this._canvas;
    const report = this._report;
    if (!canvas || !report) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(200, rect.width);
    const cssH = Math.max(120, rect.height);

    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const samples = report.samples;
    if (!samples.length) return;

    // Y-масштаб по p99, чтобы редкие выбросы не сплющивали основную часть.
    const maxY = Math.max(16, report.frame.p99 * 1.15);
    const padL = 44;
    const padR = 8;
    const padT = 20;
    const padB = 22;
    const innerW = cssW - padL - padR;
    const innerH = cssH - padT - padB;

    // Цвета из текущей темы.
    const styles = getComputedStyle(document.documentElement);
    const cFrame  = styles.getPropertyValue('--accent-head').trim()  || '#7fa8d4';
    const cUpdate = '#e6a540';
    const cRender = '#8c8';
    const cGrid   = styles.getPropertyValue('--border-soft').trim() || '#333';
    const cText   = styles.getPropertyValue('--fg-5').trim()        || '#888';

    // Сетка + подписи по Y.
    ctx.strokeStyle = cGrid;
    ctx.fillStyle = cText;
    ctx.font = '10px ui-monospace, monospace';
    ctx.lineWidth = 1;

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (innerH * i) / gridLines;
      const v = maxY * (1 - i / gridLines);
      ctx.beginPath();
      ctx.moveTo(padL, y + 0.5);
      ctx.lineTo(padL + innerW, y + 0.5);
      ctx.stroke();
      ctx.fillText(v.toFixed(0), 6, y + 3);
    }

    // Порог 30 FPS (33.34 ms) — пунктирная красная линия.
    if (maxY > 33.34) {
      const yThresh = padT + innerH * (1 - 33.34 / maxY);
      ctx.strokeStyle = '#a84a4a';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, yThresh + 0.5);
      ctx.lineTo(padL + innerW, yThresh + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Рисуем линии метрик.
    const drawLine = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const x = padL + (innerW * i) / Math.max(1, samples.length - 1);
        const v = Math.min(maxY, s[key]);
        const y = padT + innerH * (1 - v / maxY);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawLine('frame',  cFrame);
    drawLine('update', cUpdate);
    drawLine('render', cRender);

    // Подписи оси X — секунды.
    ctx.fillStyle = cText;
    const totalT = samples[samples.length - 1].t;
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const x = padL + (innerW * i) / ticks;
      const t = (totalT * i) / ticks;
      ctx.fillText(t.toFixed(1) + 's', x - 10, cssH - 6);
    }

    // Легенда.
    ctx.fillStyle = cFrame;
    ctx.fillText('Frame',  padL + 8,  padT - 6);
    ctx.fillStyle = cUpdate;
    ctx.fillText('Update', padL + 68, padT - 6);
    ctx.fillStyle = cRender;
    ctx.fillText('Render', padL + 128, padT - 6);
  }

  // ============================================================
  // Copy / Save
  // ============================================================

  _reportAsText() {
    const r = this._report;
    if (!r) return '';

    const fmt = (s) => [
      `avg ${s.avg.toFixed(2)}`,
      `min ${s.min.toFixed(2)}`,
      `max ${s.max.toFixed(2)}`,
      `p50 ${s.p50.toFixed(2)}`,
      `p95 ${s.p95.toFixed(2)}`,
      `p99 ${s.p99.toFixed(2)}`,
    ].join('  ');

    const lines = [];
    lines.push(`Профайлер Pride Engine`);
    lines.push(`Запись: ${r.duration.toFixed(1)} сек, кадров: ${r.sampleCount}`);
    lines.push(`Средний FPS: ${r.avgFps.toFixed(1)}`);
    lines.push(`Провалы (>33 ms): ${r.hitches}`);
    lines.push('');
    lines.push(`Frame:  ${fmt(r.frame)}`);
    lines.push(`Update: ${fmt(r.update)}`);
    lines.push(`Render: ${fmt(r.render)}`);
    lines.push('');
    lines.push(`Худшие кадры:`);
    for (const s of r.worst) {
      lines.push(
        `  t=${s.t.toFixed(2)}s  frame=${s.frame.toFixed(2)}  ` +
        `update=${s.update.toFixed(2)}  render=${s.render.toFixed(2)}`
      );
    }
    return lines.join('\n');
  }

  async _copyReport() {
    const text = this._reportAsText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: выделение + execCommand.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
  }

  _saveReport() {
    const text = this._reportAsText();
    if (!text) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadText(text, `profile-${stamp}.txt`);
  }

  _onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this._requestClose();
    }
  }
}

function statCells(s) {
  return `
    <td>${s.avg.toFixed(2)}</td>
    <td>${s.min.toFixed(2)}</td>
    <td>${s.max.toFixed(2)}</td>
    <td>${s.p50.toFixed(2)}</td>
    <td>${s.p95.toFixed(2)}</td>
    <td>${s.p99.toFixed(2)}</td>
  `;
}