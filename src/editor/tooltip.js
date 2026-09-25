/**
 * Глобальный кастомный тултип.
 *
 * Любой элемент с атрибутом data-tooltip получает всплывающую подсказку.
 * Текст читается из атрибута. Многострочный — через \n, отображается
 * благодаря white-space: pre-line.
 *
 * Реализация — делегирование событий на document. Один слушатель,
 * один DOM-элемент. Не мешает нативным title — они остаются как есть.
 */
export class Tooltip {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'es-tooltip';
    this.el.hidden = true;
    document.body.appendChild(this.el);

    this._current = null;

    document.addEventListener('mouseover', (e) => this._onOver(e));
    document.addEventListener('mouseout',  (e) => this._onOut(e));
    window.addEventListener('scroll', () => this._hide(), true);
    window.addEventListener('blur',   () => this._hide());
  }

  _onOver(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    if (target === this._current) return;

    this._current = target;
    this.el.textContent = target.dataset.tooltip || '';
    this.el.hidden = false;
    this._position(e);
  }

  _onOut(e) {
    if (!this._current) return;
    const next = e.relatedTarget && e.relatedTarget.closest
      ? e.relatedTarget.closest('[data-tooltip]')
      : null;
    if (next === this._current) return;   // остались внутри того же элемента
    this._hide();
  }

  _hide() {
    this.el.hidden = true;
    this._current = null;
  }

  _position(e) {
    const pad = 12;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;

    let x = e.clientX + pad;
    let y = e.clientY + pad;

    if (x + w > window.innerWidth  - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    this.el.style.left = x + 'px';
    this.el.style.top  = y + 'px';
  }
}