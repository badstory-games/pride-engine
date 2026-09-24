import { registry } from './registry.js';
import { bodyMatchesTarget, findSceneObjectByName } from './helpers.js';

export function registerActions() {
  // ---------- PHYSICS ----------
  registry.actions.register('ApplyImpulse', {
    label: 'Apply impulse',
    category: 'Physics',
    params: [
      { id: 'target', type: 'target', label: 'Target',    default: '*' },
      { id: 'ix',     type: 'number', label: 'Impulse X', default: 0 },
      { id: 'iy',     type: 'number', label: 'Impulse Y', default: -800 },
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
    label: 'Set velocity',
    category: 'Physics',
    params: [
      { id: 'target', type: 'target', label: 'Target', default: '*' },
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
    label: 'Set position',
    category: 'Transform',
    params: [
      { id: 'target', type: 'target', label: 'Target', default: '*' },
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
    label: 'Set visible',
    category: 'Display',
    params: [
      { id: 'target',  type: 'target', label: 'Target',  default: '*' },
      { id: 'visible', type: 'select', label: 'Visible', default: 'false',
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
    label: 'Set opacity',
    category: 'Display',
    params: [
      { id: 'target',  type: 'target', label: 'Target',  default: '*' },
      { id: 'opacity', type: 'number', label: 'Opacity', default: 1,
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
    label: 'Add to global variable',
    category: 'System',
    params: [
      { id: 'name',  type: 'varname', label: 'Name',  default: 'score' },
      { id: 'value', type: 'number',  label: 'Value', default: 1 },
    ],
    compile: ({ name, value }) => (ctx) => {
      ctx.vars[name] = (ctx.vars[name] ?? 0) + value;
    },
  });

  registry.actions.register('SetGlobalVar', {
    label: 'Set global variable',
    category: 'System',
    params: [
      { id: 'name',  type: 'varname', label: 'Name',  default: 'score' },
      { id: 'value', type: 'number',  label: 'Value', default: 0 },
    ],
    compile: ({ name, value }) => (ctx) => {
      ctx.vars[name] = value;
    },
  });
}