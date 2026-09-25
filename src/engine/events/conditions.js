import { registry } from './registry.js';
import { bodyMatchesAny, anyMatchingObject } from './helpers.js';

export function registerConditions() {
  registry.conditions.register('EveryTick', {
    label: 'Каждый кадр',
    description: 'Срабатывает каждый кадр, пока событие включено. Используется для непрерывной логики: движение, таймеры, постоянные проверки.',
    category: 'Система',
    params: [],
    compile: () => () => true,
  });

  registry.conditions.register('TriggerOnce', {
    label: 'Один раз',
    description: 'Пропускает действия один раз, пока остальные условия истинны. Сбрасывается, когда они становятся ложными. Убирает многократные срабатывания от зажатой клавиши или длительного контакта.',
    category: 'Система',
    params: [],
    once: true,
    compile: () => () => true,
  });

  registry.conditions.register('OnKeyPressed', {
    label: 'При нажатии клавиши',
    description: 'Истинно в том кадре, когда клавиша была нажата. Однократное срабатывание: не повторяется при удержании клавиши.',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.pressed.has(key),
  });

  registry.conditions.register('OnKeyReleased', {
    label: 'При отпускании клавиши',
    description: 'Истинно в том кадре, когда клавиша была отпущена. Однократное срабатывание. Полезно для прекращения действий: отпустил стрелку — остановился.',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.released.has(key),
  });

  registry.conditions.register('IsKeyDown', {
    label: 'При зажатии клавиши',
    description: 'Истинно всё время, пока клавиша удерживается. Проверяется каждый кадр. Используется для непрерывного движения: пока держишь стрелку, персонаж идёт.',
    category: 'Ввод',
    params: [{ id: 'key', type: 'key', label: 'Клавиша', default: 'Space' }],
    compile: ({ key }) => (ctx) => ctx.input.down.has(key),
  });

  registry.conditions.register('CompareGlobalVar', {
    label: 'Сравнить глобальную переменную',
    description: 'Сравнивает значение глобальной переменной с числом через выбранный оператор. Подходит для очков, здоровья, уровня и других общих для всей игры данных.',
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
    description: 'Истинно, если в этом кадре столкнулись два подходящих объекта. Учитывает оба порядка в паре: A столкнулся с B и B столкнулся с A равнозначны. Срабатывает один раз при появлении контакта.',
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
    description: 'Истинно, если хотя бы один объект с именем из target удовлетворяет сравнению. Переменные объекта уникальны для каждого инстанса, поэтому можно проверять здоровье конкретного врага или запас патронов конкретного игрока.',
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