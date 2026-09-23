import { registry } from './registry.js';

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
      { id: 'name',  type: 'string', label: 'Name',  default: 'score' },
      { id: 'op',    type: 'select', label: 'Op',    default: '==',
        options: ['==', '!=', '<', '<=', '>', '>='] },
      { id: 'value', type: 'number', label: 'Value', default: 0 },
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
}