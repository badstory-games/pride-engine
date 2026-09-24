/**
 * Snapshot-based undo/redo.
 *
 * Стек хранит состояния. index указывает на «активное» состояние.
 *   - begin(label)  — начать транзакцию, запомнить snapshot «до».
 *   - commit()      — сравнить с «до»; если изменилось, push нового состояния.
 *   - rollback()    — откатить открытую транзакцию к состоянию «до».
 *   - run(label,fn) — сахар: begin → fn → commit.
 *   - snapshot(l)   — атомарный snapshot без транзакции.
 *
 * Восстановление делает restoreFn(state) — он должен восстановить
 * сцену/лист/переменные и синхронизировать UI.
 */
export class History {
  constructor({ snapshotFn, restoreFn, limit = 100, isLocked = null }) {
    this.snapshotFn = snapshotFn;
    this.restoreFn  = restoreFn;
    this.limit      = limit;
    this.isLocked   = isLocked;   // () => boolean — блокирует undo/redo во время Play

    this.stack = [];              // [{ state, label, ts }]
    this.index = -1;

    this._txOpen   = false;
    this._txLabel  = null;
    this._txBefore = null;

    this.onChange = () => {};
  }

  /** Первичный snapshot. Вызывается после создания scene/project. */
  init() {
    this.stack.length = 0;
    this.stack.push({
      state: this.snapshotFn(),
      label: 'Initial',
      ts: Date.now(),
    });
    this.index = 0;
    this._txOpen   = false;
    this._txBefore = null;
    this._txLabel  = null;
    this.onChange();
  }

  clear() { this.init(); }

  get pending() { return this._txOpen; }

  // ---------- транзакции ----------

  begin(label) {
    if (this._txOpen) return;
    if (this.isLocked && this.isLocked()) return;
    this._txOpen   = true;
    this._txLabel  = label || 'Edit';
    this._txBefore = this.snapshotFn();
  }

  commit() {
    if (!this._txOpen) return;
    const before = this._txBefore;
    const label  = this._txLabel;
    this._txOpen   = false;
    this._txBefore = null;
    this._txLabel  = null;

    const after = this.snapshotFn();
    if (this._equals(before, after)) return;

    this._push(after, label);
    this.onChange();
  }

  rollback() {
    if (!this._txOpen) return;
    const before = this._txBefore;
    this._txOpen   = false;
    this._txBefore = null;
    this._txLabel  = null;
    if (before) {
      this.restoreFn(before);
      this.onChange();
    }
  }

  run(label, fn) {
    if (this._txOpen) { fn(); return; }
    this.begin(label);
    try { fn(); } finally { this.commit(); }
  }

  snapshot(label) {
    if (this._txOpen) return;
    if (this.isLocked && this.isLocked()) return;
    this._push(this.snapshotFn(), label || 'Edit');
    this.onChange();
  }

  // ---------- undo / redo ----------

  canUndo() { return this.index > 0; }
  canRedo() { return this.index >= 0 && this.index < this.stack.length - 1; }

  undo() {
    if (this.isLocked && this.isLocked()) return false;
    if (this._txOpen) this.commit();
    if (!this.canUndo()) return false;
    this.index--;
    this.restoreFn(this.stack[this.index].state);
    this.onChange();
    return true;
  }

  redo() {
    if (this.isLocked && this.isLocked()) return false;
    if (this._txOpen) this.commit();
    if (!this.canRedo()) return false;
    this.index++;
    this.restoreFn(this.stack[this.index].state);
    this.onChange();
    return true;
  }

  // ---------- internal ----------

  _push(state, label) {
    if (this.index < this.stack.length - 1) {
      this.stack.length = this.index + 1;
    }
    this.stack.push({ state, label, ts: Date.now() });
    if (this.stack.length > this.limit) {
      const drop = this.stack.length - this.limit;
      this.stack.splice(0, drop);
    }
    this.index = this.stack.length - 1;
  }

  _equals(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** Только для дебага. */
  debug() {
    return this.stack.map((e, i) => ({
      i, label: e.label,
      active: i === this.index,
    }));
  }
}