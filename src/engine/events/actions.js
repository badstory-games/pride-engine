import { registry } from './registry.js';
import {
  bodyMatchesTarget,
  findSceneObjectByName,
  forEachMatchingObject,
} from './helpers.js';

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
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.vx[i] += ix * store.invMass[i];
        store.vy[i] += iy * store.invMass[i];
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
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.vx[i] = vx;
        store.vy[i] = vy;
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
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!bodyMatchesTarget(ctx, i, target)) continue;
        store.x[i] = x;
        store.y[i] = y;
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
      const o = Math.max(0, Math.min(1, opacity));
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
      ctx.vars[name] = (ctx.vars[name] ?? 0) + value;
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
      ctx.vars[name] = value;
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
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = value;
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
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = (obj.properties[name] ?? 0) + value;
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
      forEachMatchingObject(ctx, target, (obj) => {
        obj.properties = obj.properties || {};
        obj.properties[name] = (obj.properties[name] ?? 0) - value;
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

      const clone = ctx.scene.spawnFromTemplate(template, x, y);
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
      // Собираем id до удаления: remove делает splice,
      // нельзя мутировать массив во время обхода.
      const ids = [];
      forEachMatchingObject(ctx, target, (obj) => ids.push(obj.id));

      for (const id of ids) {
        if (ctx.destroyBodyFor) ctx.destroyBodyFor(id);
        ctx.scene.remove(id);
      }
    },
  });
}