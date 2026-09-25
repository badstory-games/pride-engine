/**
 * Именованные снимки проекта.
 *
 * Хранятся в localStorage отдельно от autosave-слота.
 * Структура:
 *   pride.snapshots.index  — массив { id, name, ts, meta }
 *   pride.snapshot.<id>    — { id, name, ts, data, meta }
 *
 * Autosave (pride.project.v1) никогда сюда не пишет и снимки не трогает.
 */

const INDEX_KEY = 'pride.snapshots.index';
const SNAP_KEY  = (id) => `pride.snapshot.${id}`;

/** Список метаданных, отсортированный от новых к старым. */
export function listSnapshots() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice().sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[snapshots] writeIndex failed:', e);
  }
}

function packSnapshotData(project) {
  return {
    version: 1,
    scene:        project.scene.toJSON(),
    sheet:        project.sheet,
    varsInitial:  project.varsInitial,
    name:         project.name,
    canvasWidth:  project.canvasWidth,
    canvasHeight: project.canvasHeight,
    bgColor:      project.bgColor,
    gravityX:     project.gravityX,
    gravityY:     project.gravityY,
    assetsScope:  project.assetsScope,
    hintsShown:   project.hintsShown,
  };
}

function countEvents(sheet) {
  if (!sheet || !Array.isArray(sheet.events)) return 0;
  let n = 0;
  const walk = (arr) => {
    for (const el of arr) {
      const k = el._type || 'event';
      if (k === 'event') n++;
      if (el.children) walk(el.children);
    }
  };
  walk(sheet.events);
  return n;
}

export function saveSnapshot(project, name) {
  const id = 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const ts = Date.now();
  const data = packSnapshotData(project);
  const meta = {
    objectCount: project.scene.objects.length,
    eventCount:  countEvents(project.sheet),
    layerCount:  project.scene.layers.length,
  };

  try {
    localStorage.setItem(SNAP_KEY(id), JSON.stringify({ id, name, ts, data, meta }));
  } catch (e) {
    console.error('[snapshots] save failed:', e);
    throw e;
  }

  const list = listSnapshots();
  list.unshift({ id, name, ts, meta });
  writeIndex(list);
  return id;
}

export function loadSnapshotData(id) {
  try {
    const raw = localStorage.getItem(SNAP_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Применяет снимок к объекту project. Scene перезаписывается через
 * scene.fromJSON. Возвращает true при успехе.
 */
export function applySnapshotToProject(snapshot, project) {
  const d = snapshot && snapshot.data;
  if (!d) return false;

  project.scene.fromJSON(d.scene);
  project.sheet        = d.sheet || null;
  project.vars         = { ...(d.varsInitial || {}) };
  project.varsInitial  = { ...(d.varsInitial || {}) };
  project.name         = d.name        || 'Pride Project';
  project.canvasWidth  = d.canvasWidth  ?? 1024;
  project.canvasHeight = d.canvasHeight ?? 640;
  project.bgColor      = d.bgColor     || '#333333';
  project.gravityX     = d.gravityX ?? 0;
  project.gravityY     = d.gravityY ?? 980;
  project.assetsScope  = d.assetsScope || null;
  project.hintsShown   = d.hintsShown || {};
  return true;
}

export function deleteSnapshot(id) {
  try { localStorage.removeItem(SNAP_KEY(id)); } catch { /* ignore */ }
  const list = listSnapshots().filter((s) => s.id !== id);
  writeIndex(list);
}