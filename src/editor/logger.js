/**
 * Централизованный логгер.
 *
 * Перехватывает console.log/info/warn/error/debug, window.onerror и
 * unhandledrejection. Оригинальные вызовы console продолжают работать —
 * в DevTools всё видно, как раньше.
 *
 * Ведёт кольцевой буфер на MAX записей. Уведомляет подписчиков при любом
 * изменении (новый лог, очистка) — UI-панель перерисовывается сама.
 */

const MAX = 500;

class Logger {
  constructor() {
    this.entries = [];
    this.nextId = 1;
    this.listeners = new Set();
    this._installed = false;
  }

  install() {
    if (this._installed) return;
    this._installed = true;

    const wrap = (level, origFn) => (...args) => {
      try { origFn.apply(console, args); } catch { /* ignore */ }
      this._push(level, args, null);
    };

    const origLog   = console.log.bind(console);
    const origInfo  = console.info  ? console.info.bind(console)  : origLog;
    const origWarn  = console.warn.bind(console);
    const origError = console.error.bind(console);
    const origDebug = console.debug ? console.debug.bind(console) : origLog;

    console.log   = wrap('info',  origLog);
    console.info  = wrap('info',  origInfo);
    console.warn  = wrap('warn',  origWarn);
    console.error = wrap('error', origError);
    console.debug = wrap('debug', origDebug);

    window.addEventListener('error', (e) => {
      const err = e.error;
      const msg = err
        ? (err.stack || err.message || String(err))
        : e.message;
      this._push('error', [msg], err && err.stack ? err.stack : null);
    });

    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason;
      const msg = reason instanceof Error
        ? (reason.stack || reason.message)
        : String(reason);
      this._push('error', [msg], reason instanceof Error ? reason.stack : null);
    });
  }

  _push(level, args, stack) {
    const entry = {
      id: this.nextId++,
      ts: Date.now(),
      level,
      message: formatArgs(args),
      stack: stack || null,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX) this.entries.shift();
    this._emit();
  }

  clear() {
    this.entries.length = 0;
    this._emit();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* swallow, чтобы не зациклиться */ }
    }
  }
}

function formatArgs(args) {
  return args.map(formatArg).join(' ');
}

function formatArg(a) {
  if (typeof a === 'string') return a;
  if (a === null) return 'null';
  if (a === undefined) return 'undefined';
  if (typeof a === 'number' || typeof a === 'boolean') return String(a);
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a, (_k, v) => {
        if (v instanceof Error) return v.message;
        return v;
      });
    } catch {
      return String(a);
    }
  }
  return String(a);
}

export const logger = new Logger();