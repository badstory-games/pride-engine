import { registry } from './registry.js';
import {
  bodyMatchesTarget,
  findSceneObjectByName,
  forEachMatchingObject,
} from './helpers.js';

/**
 * Возвращает числовое значение параметра или defaultValue, если
 * значение пустое ('', null, undefined) либо не приводится к числу.
 * Защищает действия от NaN, который иначе утекает в физику, звук
 * и переменные.
 */
function numOr(v, defaultValue) {
  if (v === '' || v === null || v === undefined) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

export function registerActions() {
  // ---------- PHYSICS ----------
  registry.actions.register('ApplyImpulse', {
    label: 'Применить импульс',
    description: 'Добавляет импульс к скорости тела. Импульс делится на массу, поэтому лёгкие объекты реагируют сильнее, а тяжёлые слабее. Для прыжка игрока обычно идёт вверх с отрицательным Y.',
    category: 'Физика',
    params: [
      { id: 'target', type: 'target', label: 'Объект',    default: '*' },
      { id: 'ix',     type: 'number', label: 'Импульс X', default: 0 },
      { id: 'iy',     type: 'number', label: 'Импульс Y', default: -800 },
    ],
    compile: ({ target, ix, iy }) => (ctx) => {
      const ixv = numOr(ix, 0);
      const iyv = numOr(iy, -800);
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.vx[i] += ixv * store.invMass[i];
        store.vy[i] += iyv * store.invMass[i];
      }
    },
  });

  registry.actions.register('SetVelocity', {
    label: 'Задать скорость',
    description: 'Жёстко задаёт скорость тела в пикселях в секунду. Масса не учитывается: скорость одна для всех. Отлично подходит для управления персонажем: пока держишь клавишу, скорость постоянная.',
    category: 'Физика',
    params: [
      { id: 'target', type: 'target', label: 'Объект', default: '*' },
      { id: 'vx',     type: 'number', label: 'VX',     default: 0 },
      { id: 'vy',     type: 'number', label: 'VY',     default: 0 },
    ],
    compile: ({ target, vx, vy }) => (ctx) => {
      const vxv = numOr(vx, 0);
      const vyv = numOr(vy, 0);
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.vx[i] = vxv;
        store.vy[i] = vyv;
      }
    },
  });

  // ---------- TRANSFORM ----------
  registry.actions.register('SetPosition', {
    label: 'Задать позицию',
    description: 'Перемещает тело в точку X, Y. Работает с любым типом тела, включая статические и кинематические. Полезно для телепортации, респавна и расстановки объектов по логике.',
    category: 'Трансформация',
    params: [
      { id: 'target', type: 'target', label: 'Объект', default: '*' },
      { id: 'x',      type: 'number', label: 'X',      default: 0 },
      { id: 'y',      type: 'number', label: 'Y',      default: 0 },
    ],
    compile: ({ target, x, y }) => (ctx) => {
      const xv = numOr(x, 0);
      const yv = numOr(y, 0);
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.x[i] = xv;
        store.y[i] = yv;
      }
    },
  });

  registry.actions.register('SetVisible', {
    label: 'Задать видимость',
    description: 'Включает или выключает отрисовку объекта. Скрытый объект продолжает существовать: у него работает физика, обновляются переменные, но на экране его не видно.',
    category: 'Отображение',
    params: [
      { id: 'target',  type: 'target', label: 'Объект',    default: '*' },
      { id: 'visible', type: 'select', label: 'Видимость', default: 'false',
        options: ['true', 'false'] },
    ],
    compile: ({ target, visible }) => (ctx) => {
      const v = visible === 'true' || visible === true;
      if (!target || target === '*') {
        for (const obj of ctx.scene.objects) obj.visible = v;
      } else {
        const obj = findSceneObjectByName(ctx, target);
        if (obj) obj.visible = v;
      }
    },
  });

  registry.actions.register('SetOpacity', {
    label: 'Задать прозрачность',
    description: 'Задаёт прозрачность объекта: 0 полностью прозрачный, 1 непрозрачный. Промежуточные значения дают полупрозрачность. Удобно для эффектов появления, затухания, мигания.',
    category: 'Отображение',
    params: [
      { id: 'target',  type: 'target', label: 'Объект',       default: '*' },
      { id: 'opacity', type: 'number', label: 'Прозрачность', default: 1,
        min: 0, max: 1, step: 0.05 },
    ],
    compile: ({ target, opacity }) => (ctx) => {
      const o = Math.max(0, Math.min(1, numOr(opacity, 1)));
      if (!target || target === '*') {
        for (const obj of ctx.scene.objects) obj.opacity = o;
      } else {
        const obj = findSceneObjectByName(ctx, target);
        if (obj) obj.opacity = o;
      }
    },
  });

  // ---------- SYSTEM ----------
  registry.actions.register('AddGlobalVar', {
    label: 'Прибавить к глобальной переменной',
    description: 'Прибавляет число к глобальной переменной. Значение может быть отрицательным, тогда оно вычитается. Классика для очков, счётчиков и таймеров.',
    category: 'Система',
    params: [
      { id: 'name',  type: 'varname', label: 'Имя',      default: 'score' },
      { id: 'value', type: 'number',  label: 'Значение', default: 1 },
    ],
    compile: ({ name, value }) => (ctx) => {
      ctx.vars[name] = (ctx.vars[name] ?? 0) + numOr(value, 1);
    },
  });

  registry.actions.register('SetGlobalVar', {
    label: 'Задать глобальную переменную',
    description: 'Присваивает глобальной переменной новое значение, отбрасывая прежнее. Для накопления используйте «Прибавить к глобальной переменной».',
    category: 'Система',
    params: [
      { id: 'name',  type: 'varname', label: 'Имя',      default: 'score' },
      { id: 'value', type: 'number',  label: 'Значение', default: 0 },
    ],
    compile: ({ name, value }) => (ctx) => {
      ctx.vars[name] = numOr(value, 0);
    },
  });

  // ---------- INSTANCE VARIABLES ----------
  registry.actions.register('SetInstanceVar', {
    label: 'Задать переменную объекта',
    description: 'Задаёт значение переменной у всех объектов с именем target. Старое значение отбрасывается. Для накопления используйте «Прибавить» или «Отнять».',
    category: 'Объект',
    params: [
      { id: 'target', type: 'target',  label: 'Объект',     default: '*' },
      { id: 'var',    type: 'instvar', label: 'Переменная', default: 'hp' },
      { id: 'value',  type: 'number',  label: 'Значение',   default: 0 },
    ],
    compile: ({ target, var: name, value }) => (ctx) => {
      const v = numOr(value, 0);
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = v;
      });
    },
  });

  registry.actions.register('AddInstanceVar', {
    label: 'Прибавить к переменной объекта',
    description: 'Прибавляет число к переменной у всех объектов с именем target. Значение может быть отрицательным. Удобно для лечения, восстановления ресурсов, бонусов.',
    category: 'Объект',
    params: [
      { id: 'target', type: 'target',  label: 'Объект',     default: '*' },
      { id: 'var',    type: 'instvar', label: 'Переменная', default: 'hp' },
      { id: 'value',  type: 'number',  label: 'Значение',   default: 1 },
    ],
    compile: ({ target, var: name, value }) => (ctx) => {
      const v = numOr(value, 1);
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = (obj.properties[name] ?? 0) + v;
      });
    },
  });

  registry.actions.register('SubtractInstanceVar', {
    label: 'Отнять от переменной объекта',
    description: 'Отнимает число от переменной у всех объектов с именем target. Основной способ нанести урон: отнять у врага HP, отнять у игрока патроны, списать ресурс.',
    category: 'Объект',
    params: [
      { id: 'target', type: 'target',  label: 'Объект',     default: '*' },
      { id: 'var',    type: 'instvar', label: 'Переменная', default: 'hp' },
      { id: 'value',  type: 'number',  label: 'Значение',   default: 1 },
    ],
    compile: ({ target, var: name, value }) => (ctx) => {
      const v = numOr(value, 1);
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = (obj.properties[name] ?? 0) - v;
      });
    },
  });

  // ---------- SPAWN / DESTROY ----------
  registry.actions.register('SpawnObject', {
    label: 'Создать объект',
    description: 'Создаёт копию объекта-шаблона в точке X, Y. Координаты задают центр нового объекта, а не левый верхний угол. Копия становится обычным объектом сцены: у неё работает физика и события.',
    category: 'Объект',
    params: [
      { id: 'prefab', type: 'prefab', label: 'Шаблон', default: '' },
      { id: 'x',      type: 'number', label: 'X',      default: 0 },
      { id: 'y',      type: 'number', label: 'Y',      default: 0 },
    ],
    compile: ({ prefab, x, y }) => (ctx) => {
      if (!prefab) return;
      const template = findSceneObjectByName(ctx, prefab);
      if (!template) return;

      const xv = numOr(x, 0);
      const yv = numOr(y, 0);
      const clone = ctx.scene.spawnFromTemplate(template, xv, yv);
      if (!clone) return;

      if (ctx.spawnBodyFor) ctx.spawnBodyFor(clone);
    },
  });

  registry.actions.register('Destroy', {
    label: 'Удалить объект',
    description: 'Удаляет объект со сцены и связанное с ним физическое тело. Действие необратимо: объект исчезает полностью и не может быть восстановлен без пересоздания.',
    category: 'Объект',
    params: [
      { id: 'target', type: 'target', label: 'Объект', default: '*' },
    ],
    compile: ({ target }) => (ctx) => {
      const ids = [];
      forEachMatchingObject(ctx, target, (obj) => ids.push(obj.id));

      for (const id of ids) {
        if (ctx.destroyBodyFor) ctx.destroyBodyFor(id);
        ctx.scene.remove(id);
      }
    },
  });

  // ---------- TIMERS ----------
  registry.actions.register('StartTimer', {
    label: 'Запустить таймер',
    description: 'Создаёт именованный таймер или перезапускает существующий с нуля. Пока идёт — время копится; можно проверить условием «Таймер: прошло N секунд».',
    category: 'Таймеры',
    params: [
      { id: 'name', type: 'string', label: 'Имя', default: 'timer1' },
    ],
    compile: ({ name }) => (ctx) => ctx.timers.start(name),
  });

  registry.actions.register('StopTimer', {
    label: 'Остановить таймер',
    description: 'Приостанавливает таймер. Накопленное время сохраняется — позже можно продолжить через «Продолжить таймер».',
    category: 'Таймеры',
    params: [
      { id: 'name', type: 'string', label: 'Имя', default: 'timer1' },
    ],
    compile: ({ name }) => (ctx) => ctx.timers.stop(name),
  });

  registry.actions.register('ResumeTimer', {
    label: 'Продолжить таймер',
    description: 'Возобновляет остановленный таймер с сохранённого значения. Если таймера не существует — создаёт и запускает его с нуля.',
    category: 'Таймеры',
    params: [
      { id: 'name', type: 'string', label: 'Имя', default: 'timer1' },
    ],
    compile: ({ name }) => (ctx) => ctx.timers.resume(name),
  });

  registry.actions.register('ResetTimer', {
    label: 'Сбросить таймер',
    description: 'Обнуляет накопленное время таймера. Состояние (запущен / остановлен) не меняется: если таймер шёл — продолжит идти с нуля; если стоял — останется стоять на нуле.',
    category: 'Таймеры',
    params: [
      { id: 'name', type: 'string', label: 'Имя', default: 'timer1' },
    ],
    compile: ({ name }) => (ctx) => ctx.timers.reset(name),
  });

  // ---------- SOUND ----------
  registry.actions.register('PlaySound', {
    label: 'Проиграть звук',
    description: 'Запускает звук. Каждый вызов создаёт независимое проигрывание — один и тот же звук может играть несколько раз одновременно. Для выстрелов и ударов это нормально; для фоновой музыки ставьте «Цикл = true».',
    category: 'Звук',
    params: [
      { id: 'name',   type: 'sound',  label: 'Звук',      default: '' },
      { id: 'volume', type: 'number', label: 'Громкость', default: 1,
        min: 0, max: 1, step: 0.05 },
      { id: 'loop',   type: 'select', label: 'Цикл',      default: 'false',
        options: ['false', 'true'] },
      { id: 'pan',    type: 'number', label: 'Панорама',  default: 0,
        min: -1, max: 1, step: 0.1 },
      { id: 'pitch',  type: 'number', label: 'Тон',       default: 1,
        min: 0.1, max: 4, step: 0.1 },
    ],
    compile: ({ name, volume, loop, pan, pitch }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.play({
        id: name,
        name,
        volume: numOr(volume, 1),
        loop: loop === 'true' || loop === true,
        pan: numOr(pan, 0),
        pitch: numOr(pitch, 1),
      });
    },
  });

  registry.actions.register('StopSound', {
    label: 'Остановить звук',
    description: 'Останавливает все активные проигрывания звука с указанным именем. Ручная остановка не считается «завершением» — условие «Звук завершился» не сработает.',
    category: 'Звук',
    params: [
      { id: 'name', type: 'sound', label: 'Звук', default: '' },
    ],
    compile: ({ name }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.stop(name);
    },
  });

  registry.actions.register('StopAllSounds', {
    label: 'Остановить все звуки',
    description: 'Мгновенно останавливает всё, что играет. Полезно при переходе на новый экран или в меню. Как и «Остановить звук», не считается завершением.',
    category: 'Звук',
    params: [],
    compile: () => (ctx) => {
      if (ctx.audio) ctx.audio.stopAll();
    },
  });

  registry.actions.register('SetMasterVolume', {
    label: 'Задать общую громкость',
    description: 'Управляет громкостью всех звуков сразу. 0 — полная тишина, 1 — номинальная громкость. Хорошо подходит для слайдера в настройках игры.',
    category: 'Звук',
    params: [
      { id: 'volume', type: 'number', label: 'Громкость', default: 1,
        min: 0, max: 1, step: 0.05 },
    ],
    compile: ({ volume }) => (ctx) => {
      if (!ctx.audio) return;
      ctx.audio.setMasterVolume(numOr(volume, 1));
    },
  });

  registry.actions.register('SetSoundPan', {
    label: 'Задать панораму звука',
    description: 'Меняет панораму у всех активных проигрываний звука с таким именем. -1 — только левый канал, 1 — только правый, 0 — по центру. Полезно для позиционного звука.',
    category: 'Звук',
    params: [
      { id: 'name', type: 'sound',  label: 'Звук',     default: '' },
      { id: 'pan',  type: 'number', label: 'Панорама', default: 0,
        min: -1, max: 1, step: 0.1 },
    ],
    compile: ({ name, pan }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.setPan(name, numOr(pan, 0));
    },
  });

  registry.actions.register('SetSoundPitch', {
    label: 'Задать тон звука',
    description: 'Меняет высоту тона у активных проигрываний. 1 — норма, 0.5 — на октаву ниже, 2 — на октаву выше. Полезно для эффекта замедления времени или случайного питча у выстрелов.',
    category: 'Звук',
    params: [
      { id: 'name',  type: 'sound',  label: 'Звук', default: '' },
      { id: 'pitch', type: 'number', label: 'Тон',  default: 1,
        min: 0.1, max: 4, step: 0.1 },
    ],
    compile: ({ name, pitch }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.setPitch(name, numOr(pitch, 1));
    },
  });

  registry.actions.register('FadeInSound', {
    label: 'Плавно увеличить громкость',
    description: 'Постепенно поднимает громкость уже играющих проигрываний указанного звука до заданного уровня за N секунд. Не запускает звук заново — работает только с теми проигрываниями, которые уже созданы действием «Проиграть звук». Если звук в этот момент не играет — действие ничего не делает.',
    category: 'Звук',
    params: [
      { id: 'name',     type: 'sound',  label: 'Звук',      default: '' },
      { id: 'duration', type: 'number', label: 'Секунд',    default: 1,
        min: 0.05, step: 0.1 },
      { id: 'volume',   type: 'number', label: 'Громкость', default: 1,
        min: 0, max: 1, step: 0.05 },
    ],
    compile: ({ name, duration, volume }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.fadeIn(name, numOr(duration, 1), numOr(volume, 1));
    },
  });

  registry.actions.register('FadeOutSound', {
    label: 'Плавно уменьшить громкость',
    description: 'Постепенно снижает громкость уже играющих проигрываний указанного звука до нуля за N секунд, после чего останавливает их. Не запускает звук — работает только с активными проигрываниями. Такое затухание не считается «завершением»: условие «Звук завершился» не сработает.',
    category: 'Звук',
    params: [
      { id: 'name',     type: 'sound',  label: 'Звук',   default: '' },
      { id: 'duration', type: 'number', label: 'Секунд', default: 1,
        min: 0.05, step: 0.1 },
    ],
    compile: ({ name, duration }) => (ctx) => {
      if (!name || !ctx.audio) return;
      ctx.audio.fadeOut(name, numOr(duration, 1));
    },
  });
}