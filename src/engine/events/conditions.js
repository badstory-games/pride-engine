import { registry } from './registry.js';
import { bodyMatchesAny, anyMatchingObject } from './helpers.js';

export function registerConditions() {
  registry.conditions.register('EveryTick', {
    label: 'Каждый кадр',
    category: 'Система',
    params: [],
    compile: () => () => true,
  });

  registry.conditions.register('TriggerOnce', {
    label: 'Один раз',
    category: 'Система',
    params: [],
    once: true,
    compile: () => () => true,
  });

  registry.conditions.register('OnKeyPressed', {
    label: 'При нажатии клавиши',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.pressed.has(key),
  });

  registry.conditions.register('OnKeyReleased', {
    label: 'При отпускании клавиши',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.released.has(key),
  });

  registry.conditions.register('IsKeyDown', {
    label: 'Клавиша нажата',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.down.has(key),
  });

  registry.conditions.register('CompareGlobalVar', {
    label: 'Сравнить глобальную переменную',
    category: 'Система',
    params: [
      { id: 'name',  type: 'varname', label: 'Имя',       default: 'score' },
      { id: 'op',    type: 'select',  label: 'Операция',  default: '==',
        options: ['==', '!=', '<', '<=', '>', '>='] },
      { id: 'value', type: 'number',  label: 'Значение',  default: 0 },
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

  registry.conditions.register('OnCollision', {
    label: 'При столкновении',
    category: 'Столкновения',
    params: [
      { id: 'a', type: 'target', label: 'Объект A', default: '*' },
      { id: 'b', type: 'target', label: 'Объект B', default: '*' },
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

  registry.conditions.register('CompareInstanceVar', {
    label: 'Сравнить переменную объекта',
    category: 'Объект',
    params: [
      { id: 'target', type: 'target',  label: 'Объект',   default: '*' },
      { id: 'var',    type: 'instvar', label: 'Переменная', default: 'hp' },
      { id: 'op',     type: 'select',  label: 'Операция',   default: '==',
        options: ['==', '!=', '<', '<=', '>', '>='] },
      { id: 'value',  type: 'number',  label: 'Значение',   default: 0 },
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