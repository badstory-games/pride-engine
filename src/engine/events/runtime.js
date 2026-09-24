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
    this.program = (this.sheet && this.sheet.events || [])
      .map((e) => this._compileEvent(e));
  }

  _compileEvent(event) {
    const node = {
      id: event.id,
      disabled: !!event.disabled,
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

    node.children = (event.children || []).map((c) => this._compileEvent(c));
    return node;
  }

  tick(dt) {
    if (!this.program.length) return;
    const ctx = this.ctxFactory(dt);
    for (const node of this.program) this._run(node, ctx);
  }

  _run(node, ctx) {
    if (node.disabled) return;

    // --- 1) Оцениваем ВСЕ non-once условия ---
    let pass = true;
    for (let i = 0; i < node.conditions.length; i++) {
      const c = node.conditions[i];
      if (c.once) continue;
      if (!c.fn(ctx)) { pass = false; break; }
    }

    // --- 2) Любое non-once условие ложно → сбрасываем once-флаги.
    //         Только в этот момент TriggerOnce "взводится" заново.
    if (!pass) {
      for (let i = 0; i < node.conditions.length; i++) {
        if (node.conditions[i].once) node._once[i] = false;
      }
      return;
    }

    // --- 3) Все non-once условия истинны. Если хоть один once уже
    //         сработал — выходим БЕЗ сброса (иначе сработаем через кадр).
    for (let i = 0; i < node.conditions.length; i++) {
      if (node.conditions[i].once && node._once[i]) return;
    }

    // --- 4) Срабатываем, взводим once-флаги ---
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