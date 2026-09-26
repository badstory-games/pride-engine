/**
 * Глобальный оверлей загрузки — центрированный спиннер с подписью.
 *
 * Показывается только если операция длится дольше SHOW_DELAY мс, чтобы
 * фоновые действия (будущий autosave) не мигали спиннером. Для
 * пользовательских операций (Save / Open / Export / Snapshot) есть
 * опция immediate — оверлей открывается синхронно, без задержки.
 *
 * MIN_VISIBLE гарантирует, что если оверлей открылся, он останется
 * на экране хотя бы MIN_VISIBLE мс — даже если операция завершилась
 * мгновенно. Это защищает от «мигания» на один кадр.
 *
 * Состояния (машина состояний с одним активным таймером):
 *
 *   idle         → ничего не показано, таймера нет.
 *   pending-show → show() вызван, ждём SHOW_DELAY перед показом.
 *   visible      → оверлей виден.
 *   pending-hide → hide() вызван, ждём окончания MIN_VISIBLE перед скрытием.
 *
 * Переходы:
 *   idle         --show()-->  pending-show
 *   pending-show --show()-->  pending-show  (обновить текст, pending++)
 *   pending-show --hide()-->  idle          (показ отменён)
 *   pending-show --timer-->   visible
 *   visible      --show()-->  visible       (обновить текст, pending++)
 *   visible      --hide()-->  pending-hide  (если pending == 0)
 *   pending-hide --show()-->  visible       (передумали скрывать)
 *   pending-hide --timer-->   idle
 *
 * Safety-таймер — страховка от «залипшего» _pending. Если оверлей
 * висит дольше SAFETY_MS, состояние аварийно сбрасывается.
 *
 * Отладка: LoadingOverlay.debug() и LoadingOverlay.forceHide().
 *
 * Использование:
 *   LoadingOverlay.show('Сохранение…', { immediate: true });
 *   try { ... } finally { LoadingOverlay.hide(); }
 */

const SHOW_DELAY  = 180;    // мс — ждём перед показом (обычный режим)
const MIN_VISIBLE = 350;    // мс — минимум держим на экране
const FADE_MS     = 220;    // мс — длительность fade-out (совпадает с CSS)
const SAFETY_MS   = 180_000; // мс — аварийный сброс при зависании (3 мин)

class LoadingOverlayImpl {
  constructor() {
    this.el = null;
    this.textEl = null;

    this._pending = 0;
    this._text = 'Загрузка…';
    this._state = 'idle';
    this._timer = null;
    this._shownAt = 0;
    this._safetyTimer = null;
  }

  // ============================================================
  // Public
  // ============================================================

  /**
   * @param {string} text — подпись под спиннером.
   * @param {{ immediate?: boolean }} [opts]
   *        immediate:true — открыть оверлей синхронно, без SHOW_DELAY.
   *        Используется для операций, инициированных пользователем.
   */
  show(text = 'Загрузка…', opts = {}) {
    const immediate = !!opts.immediate;

    this._pending++;
    this._text = String(text);
    this._ensure();

    // Уже показываем или ждём показа — обновляем только текст.
    if (this._pending > 1) {
      if (this._state === 'visible' || this._state === 'pending-hide') {
        this._setText(this._text);
      }
      return;
    }

    // Передумали скрывать: pending-hide отменяется, остаёмся видимыми.
    if (this._state === 'pending-hide') {
      this._cancelTimer();
      this._state = 'visible';
      this._setText(this._text);
      this._startSafety();
      return;
    }

    // Уже видимо — обновляем текст.
    if (this._state === 'visible') {
      this._setText(this._text);
      this._startSafety();
      return;
    }

    // idle или pending-show: запускаем (или перезапускаем) показ.
    this._cancelTimer();

    if (immediate) {
      this._open();
    } else {
      this._state = 'pending-show';
      this._timer = setTimeout(() => {
        this._timer = null;
        if (this._pending === 0) {
          this._state = 'idle';
          return;
        }
        this._open();
      }, SHOW_DELAY);
    }

    this._startSafety();
  }

  hide() {
    if (this._pending > 0) this._pending--;
    if (this._pending > 0) return;

    this._stopSafety();

    if (this._state === 'pending-show') {
      this._cancelTimer();
      this._state = 'idle';
      return;
    }

    if (this._state !== 'visible') return;

    const elapsed = performance.now() - this._shownAt;
    const wait = Math.max(0, MIN_VISIBLE - elapsed);

    this._cancelTimer();
    this._state = 'pending-hide';
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._pending > 0) {
        this._state = 'visible';
        return;
      }
      this._close();
    }, wait);
  }

  /** Аварийный сброс — принудительно закрывает оверлей. */
  forceHide() {
    this._pending = 0;
    this._cancelTimer();
    this._stopSafety();

    if (this._state === 'visible' || this._state === 'pending-hide') {
      this._close();
    } else {
      this._state = 'idle';
      if (this.el) {
        this.el.classList.remove('visible');
        this.el.hidden = true;
      }
    }
  }

  /** Текущее внутреннее состояние — для отладки из консоли. */
  debug() {
    const info = {
      state:      this._state,
      pending:    this._pending,
      text:       this._text,
      hasTimer:   this._timer != null,
      hasSafety:  this._safetyTimer != null,
      domVisible: this.el ? !this.el.hidden : false,
      hasClass:   this.el ? this.el.classList.contains('visible') : false,
    };
    console.log('[LoadingOverlay]', info);
    return info;
  }

  /** Обёртка: показывает оверлей на время промиса. */
  async wrap(promise, text = 'Загрузка…', opts = {}) {
    this.show(text, opts);
    try {
      return await promise;
    } finally {
      this.hide();
    }
  }

  // ============================================================
  // Internals
  // ============================================================

  _open() {
    this._state = 'visible';
    this._shownAt = performance.now();
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('visible');
    this._setText(this._text);
  }

  _close() {
    this._state = 'idle';
    if (!this.el) return;

    this.el.classList.remove('visible');

    const el = this.el;
    setTimeout(() => {
      if (this._state === 'idle' && !el.classList.contains('visible')) {
        el.hidden = true;
      }
    }, FADE_MS);
  }

  _cancelTimer() {
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _startSafety() {
    this._stopSafety();
    this._safetyTimer = setTimeout(() => {
      this._safetyTimer = null;
      if (this._pending > 0) {
        console.warn(
          `[loading] safety reset — _pending=${this._pending}, state=${this._state}`
        );
        this.forceHide();
      }
    }, SAFETY_MS);
  }

  _stopSafety() {
    if (this._safetyTimer != null) {
      clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }
  }

  _ensure() {
    if (this.el) return;

    const el = document.createElement('div');
    el.className = 'loading-overlay';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    el.innerHTML = `
      <div class="loading-overlay-inner">
        <svg class="loading-spinner" viewBox="0 0 60 60" aria-hidden="true">
          <circle class="loading-spinner-track" cx="30" cy="30" r="24" />
          <circle class="loading-spinner-arc"   cx="30" cy="30" r="24" />
          <circle class="loading-spinner-dot"   cx="30" cy="6"  r="3.2" />
        </svg>
        <div class="loading-overlay-text"></div>
      </div>
    `;

    document.body.appendChild(el);
    this.el = el;
    this.textEl = el.querySelector('.loading-overlay-text');
  }

  _setText(text) {
    if (this.textEl && this.textEl.textContent !== text) {
      this.textEl.textContent = text;
    }
  }
}

export const LoadingOverlay = new LoadingOverlayImpl();