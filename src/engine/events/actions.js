import { registry } from './registry.js';
import { bodyMatchesTarget, findSceneObjectByName, forEachMatchingObject } from './helpers.js';

export function registerActions() {
  // ---------- PHYSICS ----------
  registry.actions.register('ApplyImpulse', {
    label: 'Применить импульс',
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
}