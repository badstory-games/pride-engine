import { BodyType } from '../physics/body.js';

/**
 * Для ФИЗИЧЕСКИХ ДЕЙСТВИЙ (ApplyImpulse, SetVelocity...).
 *   target = '*' → только DYNAMIC тела (статические отфильтровываются,
 *                 чтобы не тратить время впустую)
 *   target = 'X' → тело с объектом сцены, у которого name === 'X'
 */
export function bodyMatchesTarget(ctx, bodyIndex, target) {
  const store = ctx.world.bodies;

  if (!target || target === '*') {
    return store.btype[bodyIndex] === BodyType.DYNAMIC;
  }

  const objId = store.userId[bodyIndex];
  const obj = objId >= 0 ? ctx.scene.get(objId) : null;
  return !!obj && obj.name === target;
}

/**
 * Для OnCollision.
 *   target = '*' → ЛЮБОЕ тело (dynamic, static, kinematic)
 *   target = 'X' → тело с объектом сцены, у которого name === 'X'
 */
export function bodyMatchesAny(ctx, bodyIndex, target) {
  const store = ctx.world.bodies;

  if (!target || target === '*') return true;

  const objId = store.userId[bodyIndex];
  const obj = objId >= 0 ? ctx.scene.get(objId) : null;
  return !!obj && obj.name === target;
}

export function findSceneObjectByBody(ctx, bodyIndex) {
  const store = ctx.world.bodies;
  const objId = store.userId[bodyIndex];
  return objId >= 0 ? ctx.scene.get(objId) : null;
}

export function findSceneObjectByName(ctx, name) {
  if (!name || name === '*') return null;
  for (const obj of ctx.scene.objects) {
    if (obj.name === name) return obj;
  }
  return null;
}