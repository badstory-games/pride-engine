import { registry } from './registry.js';
import { BodyType } from '../physics/body.js';

/** Проверяет, попадает ли тело i под target: '*' — все динамические, иначе по name. */
function matchTarget(ctx, i, target) {
  const store = ctx.world.bodies;
  if (store.btype[i] !== BodyType.DYNAMIC) return false;
  if (!target || target === '*') return true;

  const objId = store.userId[i];
  const obj = objId >= 0 ? ctx.scene.get(objId) : null;
  return !!obj && obj.name === target;
}

export function registerActions() {
  registry.actions.register('ApplyImpulse', {
    label: 'Apply impulse',
    category: 'Physics',
    params: [
      { id: 'target', type: 'target', label: 'Target',     default: '*' },
      { id: 'ix',     type: 'number', label: 'Impulse X',  default: 0 },
      { id: 'iy',     type: 'number', label: 'Impulse Y',  default: -800 },
    ],
    compile: ({ target, ix, iy }) => (ctx) => {
      const store = ctx.world.bodies;
      for (let i = 0; i < store.count; i++) {
        if (!matchTarget(ctx, i, target)) continue;
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
        if (!matchTarget(ctx, i, target)) continue;
        store.vx[i] = vx;
        store.vy[i] = vy;
      }
    },
  });

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
        if (!matchTarget(ctx, i, target)) continue;
        store.x[i] = x;
        store.y[i] = y;
      }
    },
  });

  registry.actions.register('AddGlobalVar', {
    label: 'Add to global variable',
    category: 'System',
    params: [
      { id: 'name',  type: 'string', label: 'Name',  default: 'score' },
      { id: 'value', type: 'number', label: 'Value', default: 1 },
    ],
    compile: ({ name, value }) => (ctx) => {
      ctx.vars[name] = (ctx.vars[name] ?? 0) + value;
    },
  });
}