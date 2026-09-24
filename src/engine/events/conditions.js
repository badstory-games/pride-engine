import { registry } from './registry.js';
import { bodyMatchesAny, anyMatchingObject } from './helpers.js';

export function registerConditions() {
  registry.conditions.register('EveryTick', {
    label: 'Every tick',
    category: 'System',
    params: [],
    compile: () => () => true,
  });

  registry.conditions.register('TriggerOnce', {
    label: 'Trigger once',
    category: 'System',
    params: [],
    once: true,
    compile: () => () => true,
  });

  registry.conditions.register('OnKeyPressed', {
    label: 'On key pressed',
    category: 'Input',
    params: [{ id: 'key', type: 'key', label: 'Key', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.pressed.has(key),
  });

  registry.conditions.register('OnKeyReleased', {
    label: 'On key released',
    category: 'Input',
    params: [{ id: 'key', type: 'key', label: 'Key', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.released.has(key),
  });

  registry.conditions.register('IsKeyDown', {
    label: 'Is key down',
    category: 'Input',
    params: [{ id: 'key', type: 'key', label: 'Key', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.down.has(key),
  });

  registry.conditions.register('CompareGlobalVar', {
    label: 'Compare global variable',
    category: 'System',
    params: [
      { id: 'name',  type: 'varname', label: 'Name',  default: 'score' },
      { id: 'op',    type: 'select',  label: 'Op',    default: '==',
        options: ['==', '!=', '<', '<=', '>', '>='] },
      { id: 'value', type: 'number',  label: 'Value', default: 0 },
    ],
    compile: ({ name, op, value }) => (ctx) => {
      const v = ctx.vars[name] ?? 0;
      switch (op) {
        case '==': return v === value;
        case '!=': return v !== value;
        case '<':  return v <  value;
        case '<=': return v <= value;
        case '>':  return v >  value;
        case '>=': return v >= value;
      }
      return false;
    },
  });

  /**
   * Срабатывает ОДИН РАЗ при появлении новой пары контактов.
   * Пока тела касаются — повторно не сработает.
   */
  registry.conditions.register('OnCollision', {
    label: 'On collision',
    category: 'Collision',
    params: [
      { id: 'a', type: 'target', label: 'A', default: '*' },
      { id: 'b', type: 'target', label: 'B', default: '*' },
    ],
    compile: ({ a, b }) => (ctx) => {
      const cols = ctx.world.newCollisions;
      for (let i = 0; i < cols.length; i++) {
        const m = cols[i];
        if (bodyMatchesAny(ctx, m.a, a) && bodyMatchesAny(ctx, m.b, b)) return true;
        if (bodyMatchesAny(ctx, m.b, a) && bodyMatchesAny(ctx, m.a, b)) return true;
      }
      return false;
    },
  });

  // ---------- INSTANCE VARIABLES ----------

  /**
   * Сравнивает instance-переменную с числом.
   * Семантика: «истина, если ХОТЯ БЫ ОДИН объект под target удовлетворяет».
   */
  registry.conditions.register('CompareInstanceVar', {
    label: 'Compare instance variable',
    category: 'Instance',
    params: [
      { id: 'target', type: 'target',  label: 'Target',   default: '*' },
      { id: 'var',    type: 'instvar', label: 'Variable', default: 'hp' },
      { id: 'op',     type: 'select',  label: 'Op',       default: '==',
        options: ['==', '!=', '<', '<=', '>', '>='] },
      { id: 'value',  type: 'number',  label: 'Value',    default: 0 },
    ],
    compile: ({ target, var: name, op, value }) => (ctx) => {
      return anyMatchingObject(ctx, target, (obj) => {
        const props = obj.properties || {};
        const v = props[name] ?? 0;
        switch (op) {
          case '==': return v === value;
          case '!=': return v !== value;
          case '<':  return v <  value;
          case '<=': return v <= value;
          case '>':  return v >  value;
          case '>=': return v >= value;
        }
        return false;
      });
    },
  });
}