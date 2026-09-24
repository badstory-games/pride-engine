/**
 * Утилиты для работы со «смешанным» event sheet:
 * события + группы + комментарии в одном массиве.
 *
 * Элемент без _type — это Event (для совместимости со старыми проектами).
 */

export const EVENT   = 'event';
export const GROUP   = 'group';
export const COMMENT = 'comment';

export function kindOf(el) {
  return el._type || EVENT;
}
export function isEvent(el)   { return kindOf(el) === EVENT; }
export function isGroup(el)   { return kindOf(el) === GROUP; }
export function isComment(el) { return kindOf(el) === COMMENT; }

/** Обход только Event-ов (группы рекурсивно, комментарии пропускаются). */
export function walkEvents(arr, fn) {
  for (const el of arr) {
    const k = kindOf(el);
    if (k === COMMENT) continue;
    if (k === GROUP) walkEvents(el.children || [], fn);
    else fn(el);
  }
}

/** Все id (события, группы, комментарии) в дереве. */
export function collectIds(arr, out = []) {
  for (const el of arr) {
    out.push(el.id);
    if (el.children) collectIds(el.children, out);
  }
  return out;
}

export function nextId(sheet) {
  const ids = collectIds(sheet.events || []);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

export function findElement(sheet, id, arr) {
  arr = arr || sheet.events;
  for (const el of arr) {
    if (el.id === id) return el;
    if (el.children) {
      const r = findElement(sheet, id, el.children);
      if (r) return r;
    }
  }
  return null;
}

export function findParentArray(sheet, id, arr) {
  arr = arr || sheet.events;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return { arr, idx: i };
    if (arr[i].children) {
      const r = findParentArray(sheet, id, arr[i].children);
      if (r) return r;
    }
  }
  return null;
}

/** Есть ли внутри события/группы withOnce-условия (для ResetOnce). */
export function forEachEventNode(sheet, fn) {
  walkEvents(sheet.events || [], fn);
}