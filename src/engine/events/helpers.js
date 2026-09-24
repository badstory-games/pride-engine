import { BodyType } from '../physics/body.js';

/**
 * Для ФИЗИЧЕСКИХ ДЕЙСТВИЙ (ApplyImpulse, SetVelocity...).
 *   target = '*' → только DYNAMIC тела (статические отфильтровываются)
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

/**
 * Обходит все объекты сцены, попадающие под target.
 *   target = '*' → все объекты сцены
 *   target = 'X' → все объекты с name === 'X'
 *
 * Используется в instance-variable действиях, где нам нужно
 * затронуть КАЖДЫЙ инстанс с этим именем (Construct-style picking
 * отсутствует, поэтому оперируем множеством).
 */
export function forEachMatchingObject(ctx, target, fn) {
  const objs = ctx.scene.objects;
  if (!target || target === '*') {
    for (let i = 0; i < objs.length; i++) fn(objs[i]);
    return;
  }
  for (let i = 0; i < objs.length; i++) {
    if (objs[i].name === target) fn(objs[i]);
  }
}

/**
 * Возвращает true, если хотя бы один объект под target удовлетворяет
 * предикату fn(obj). Используется в CompareInstanceVar.
 */
export function anyMatchingObject(ctx, target, fn) {
  const objs = ctx.scene.objects;
  if (!target || target === '*') {
    for (let i = 0; i < objs.length; i++) if (fn(objs[i])) return true;
    return false;
  }
  for (let i = 0; i < objs.length; i++) {
    if (objs[i].name === target && fn(objs[i])) return true;
  }
  return false;
}