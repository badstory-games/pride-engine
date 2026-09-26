import { BodyType } from '../physics/body.js';

/**
 * Для ФИЗИЧЕСКИХ ДЕЙСТВИЙ (ApplyImpulse, SetVelocity...).
 *   target = '*' → только DYNAMIC тела
 *   target = 'X' → тело с объектом сцены, у которого name === 'X'
 */
export function bodyMatchesTarget(ctx, bodyIndex, target) {
  const store = ctx.world.bodies;

  if (!target || target === '*') {
    return store.btype[bodyIndex] === BodyType.DYNAMIC;
  }

  const objId = store.userId[bodyIndex];
  const obj = objId >= 0 ? ctx.scene.get(objId) : null;
  return !!obj && !obj._dead && obj.name === target;
}

/**
 * Для OnCollision.
 *   target = '*' → ЛЮБОЕ тело
 *   target = 'X' → тело с объектом сцены, name === 'X'
 */
export function bodyMatchesAny(ctx, bodyIndex, target) {
  const store = ctx.world.bodies;

  if (!target || target === '*') return true;

  const objId = store.userId[bodyIndex];
  const obj = objId >= 0 ? ctx.scene.get(objId) : null;
  return !!obj && !obj._dead && obj.name === target;
}

export function findSceneObjectByBody(ctx, bodyIndex) {
  const store = ctx.world.bodies;
  const objId = store.userId[bodyIndex];
  return objId >= 0 ? ctx.scene.get(objId) : null;
}

export function findSceneObjectByName(ctx, name) {
  if (!name || name === '*') return null;
  const objs = ctx.scene.objects;
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o._dead && o.name === name) return o;
  }
  return null;
}

/**
 * Обходит все объекты сцены, попадающие под target.
 * Мёртвые (удалённые, но ещё не сжатые) пропускаются.
 */
export function forEachMatchingObject(ctx, target, fn) {
  const objs = ctx.scene.objects;
  if (!target || target === '*') {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o._dead) fn(o);
    }
    return;
  }
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o._dead && o.name === target) fn(o);
  }
}

/**
 * Истинно, если хотя бы один объект под target удовлетворяет предикату.
 */
export function anyMatchingObject(ctx, target, fn) {
  const objs = ctx.scene.objects;
  if (!target || target === '*') {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o._dead && fn(o)) return true;
    }
    return false;
  }
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o._dead && o.name === target && fn(o)) return true;
  }
  return false;
}