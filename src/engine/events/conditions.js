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

  // ---------- TIMERS ----------

  registry.conditions.register('EverySeconds', {
    label: 'Каждые N секунд',
    description: 'Срабатывает через каждые N секунд работы события. Первое срабатывание — через N секунд после старта игры. Полезно для повторяющихся действий: спавн врагов, тик урона, восстановление ресурсов.',
    category: 'Таймеры',
    params: [
      { id: 'interval', type: 'number', label: 'Интервал (с)', default: 1, min: 0.01, step: 0.1 },
    ],
    compile: ({ interval }) => (ctx, slot) => {
      const iv = Math.max(0.001, interval);
      if (slot.nextFire === undefined) slot.nextFire = iv;
      if (ctx.elapsed >= slot.nextFire) {
        slot.nextFire += iv;
        return true;
      }
      return false;
    },
  });

  registry.conditions.register('AfterSeconds', {
    label: 'Через N секунд',
    description: 'Срабатывает один раз, когда с момента старта игры прошло N секунд. Для повторного запуска нужно остановить и снова запустить игру.',
    category: 'Таймеры',
    params: [
      { id: 'seconds', type: 'number', label: 'Секунд', default: 1, min: 0, step: 0.1 },
    ],
    compile: ({ seconds }) => (ctx, slot) => {
      if (slot.fired) return false;
      if (ctx.elapsed >= seconds) {
        slot.fired = true;
        return true;
      }
      return false;
    },
  });

  registry.conditions.register('AfterFrames', {
    label: 'Через N кадров',
    description: 'Срабатывает один раз, когда с момента старта игры прошло N кадров. Один кадр = один тик физики, обычно 1/60 секунды. Полезно для коротких задержек без привязки к реальному времени.',
    category: 'Таймеры',
    params: [
      { id: 'frames', type: 'number', label: 'Кадров', default: 60, min: 1, step: 1 },
    ],
    compile: ({ frames }) => (ctx, slot) => {
      if (slot.fired) return false;
      slot.counter = (slot.counter || 0) + 1;
      if (slot.counter >= frames) {
        slot.fired = true;
        return true;
      }
      return false;
    },
  });

  registry.conditions.register('TimerElapsed', {
    label: 'Таймер: прошло N секунд',
    description: 'Истинно, если именованный таймер накопил не меньше N секунд. Таймер создаётся и запускается действием «Запустить таймер». Пока идёт — время копится; когда остановлен — стоит на месте.',
    category: 'Таймеры',
    params: [
      { id: 'name',    type: 'string', label: 'Имя',     default: 'timer1' },
      { id: 'seconds', type: 'number', label: 'Секунд',  default: 1, min: 0, step: 0.1 },
    ],
    compile: ({ name, seconds }) => (ctx) => {
      return ctx.timers.getElapsed(name) >= seconds;
    },
  });

  // ---------- SOUND ----------

  registry.conditions.register('IsSoundPlaying', {
    label: 'Звук играет',
    description: 'Истинно, если хотя бы одно проигрывание звука с таким именем активно прямо сейчас. Для зацикленного звука остаётся истинным, пока его не остановят. Для обычного — пока не доиграет.',
    category: 'Звук',
    params: [
      { id: 'name', type: 'sound', label: 'Звук', default: '' },
    ],
    compile: ({ name }) => (ctx) => {
      if (!name || !ctx.audio) return false;
      return ctx.audio.isPlaying(name);
    },
  });

  registry.conditions.register('OnSoundEnded', {
    label: 'Звук завершился',
    description: 'Срабатывает один раз, когда звук доиграл до конца естественно. Ручная остановка и fade out завершением не считаются. Если звук играет несколько раз параллельно — событие сработает один раз на каждый завершившийся экземпляр.',
    category: 'Звук',
    params: [
      { id: 'name', type: 'sound', label: 'Звук', default: '' },
    ],
    compile: ({ name }) => (ctx) => {
      if (!name) return false;
      const ended = ctx.endedSounds;
      if (!ended || ended.length === 0) return false;
      for (let i = 0; i < ended.length; i++) {
        if (ended[i] === name) return true;
      }
      return false;
    },
  });
}