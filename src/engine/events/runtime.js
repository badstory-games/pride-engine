import { registry } from './registry.js';

export class EventRuntime {
  constructor(sheet, ctxFactory) {
    this.sheet = sheet;
    this.ctxFactory = ctxFactory;
    this.program = [];
    this.compile();
  }

  setSheet(sheet) {
    this.sheet = sheet;
    this.compile();
  }

  compile() {
    const flat = [];
    this._flatten(this.sheet && this.sheet.events || [], false, flat);
    this.program = flat.map(({ event, disabled }) =>
      this._compileEvent(event, disabled)
    );
  }

  /** Рекурсивно собирает события, учитывая disabled групп. */
  _flatten(arr, parentDisabled, out) {
    for (const el of arr) {
      const k = el._type || 'event';
      if (k === 'comment') continue;

      if (k === 'group') {
        const groupDisabled = parentDisabled || !!el.disabled;
        this._flatten(el.children || [], groupDisabled, out);
        continue;
      }

      out.push({ event: el, disabled: parentDisabled || !!el.disabled });
    }
  }

  _compileEvent(event, parentDisabled) {
    const node = {
      id: event.id,
      disabled: !!event.disabled || !!parentDisabled,
      conditions: [],
      actions: [],
      children: [],
      _once: [],
    };

    const conds = event.conditions || [];
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const def = registry.conditions.get(c.type);
      if (!def) { console.warn(`[events] unknown condition: ${c.type}`); continue; }
      try {
        node.conditions.push({
          type: c.type,
          fn: def.compile(c.params || {}),
          once: !!def.once,
        });
        node._once.push(false);
      } catch (e) {
        console.error(`[events] compile ${c.type}:`, e);
      }
    }

    for (const a of (event.actions || [])) {
      const def = registry.actions.get(a.type);
      if (!def) { console.warn(`[events] unknown action: ${a.type}`); continue; }
      try {
        node.actions.push(def.compile(a.params || {}));
      } catch (e) {
        console.error(`[events] compile ${a.type}:`, e);
      }
    }

    node.children = (event.children || []).map((c) => this._compileEvent(c, false));
    return node;
  }

  tick(dt) {
    if (!this.program.length) return;
    const ctx = this.ctxFactory(dt);
    for (const node of this.program) this._run(node, ctx);
  }

  _run(node, ctx) {
    if (node.disabled) return;

    let pass = true;
    for (let i = 0; i < node.conditions.length; i++) {
      const c = node.conditions[i];
      if (c.once) continue;
      if (!c.fn(ctx)) { pass = false; break; }
    }

    if (!pass) {
      for (let i = 0; i < node.conditions.length; i++) {
        if (node.conditions[i].once) node._once[i] = false;
      }
      return;
    }

    for (let i = 0; i < node.conditions.length; i++) {
      if (node.conditions[i].once && node._once[i]) return;
    }

    for (let i = 0; i < node.conditions.length; i++) {
      if (node.conditions[i].once) node._once[i] = true;
    }

    for (const a of node.actions) a(ctx);
    for (const child of node.children) this._run(child, ctx);
  }

  reset() {
    for (const node of this.program) this._resetOnce(node);
  }

  _resetOnce(node) {
    for (let i = 0; i < node._once.length; i++) node._once[i] = false;
    for (const c of node.children) this._resetOnce(c);
  }
}