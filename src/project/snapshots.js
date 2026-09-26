/**
 * Именованные снимки проекта.
 *
 * Изолированы по проекту:
 *   pride.snapshots.<projectId>.index  — метаданные
 *   pride.snapshot.<projectId>.<snapId> — сами данные
 *
 * Autosave в `pride.project.<id>` снимки не трогает.
 *
 * currentProjectId устанавливается через setCurrentProject(id).
 */

let currentProjectId = null;

export function setCurrentProject(id) {
  currentProjectId = id || null;
}

export function getCurrentProject() {
  return currentProjectId;
}

const indexKey = (pid) => `pride.snapshots.${pid}.index`;
const snapKey  = (pid, sid) => `pride.snapshot.${pid}.${sid}`;

function needProject() {
  if (!currentProjectId) {
    console.warn('[snapshots] no current project set');
    return false;
  }
  return true;
}

/** Список метаданных, отсортированный от новых к старым. */
export function listSnapshots(projectId = null) {
  const pid = projectId || currentProjectId;
  if (!pid) return [];
  try {
    const raw = localStorage.getItem(indexKey(pid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice().sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

function writeIndex(pid, list) {
  try {
    localStorage.setItem(indexKey(pid), JSON.stringify(list));
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
  if (!project || !project.id) {
    throw new Error('[snapshots] save: project.id required');
  }
  if (!needProject()) throw new Error('No current project');

  project.scene.flush();

  const pid = project.id;
  const id  = 'snap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const ts  = Date.now();
  const data = packSnapshotData(project);
  const meta = {
    objectCount: project.scene.objects.length,
    eventCount:  countEvents(project.sheet),
    layerCount:  project.scene.layers.length,
  };

  try {
    localStorage.setItem(snapKey(pid, id), JSON.stringify({ id, name, ts, data, meta }));
  } catch (e) {
    console.error('[snapshots] save failed:', e);
    throw e;
  }

  const list = listSnapshots(pid);
  list.unshift({ id, name, ts, meta });
  writeIndex(pid, list);
  return id;
}

export function loadSnapshotData(id, projectId = null) {
  const pid = projectId || currentProjectId;
  if (!pid) return null;
  try {
    const raw = localStorage.getItem(snapKey(pid, id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

export function deleteSnapshot(id, projectId = null) {
  const pid = projectId || currentProjectId;
  if (!pid) return;
  try { localStorage.removeItem(snapKey(pid, id)); } catch { /* ignore */ }
  const list = listSnapshots(pid).filter((s) => s.id !== id);
  writeIndex(pid, list);
}

/** Удаляет все снимки проекта (при удалении проекта). */
export function deleteAllSnapshots(projectId) {
  if (!projectId) return;
  const list = listSnapshots(projectId);
  for (const s of list) {
    try { localStorage.removeItem(snapKey(projectId, s.id)); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(indexKey(projectId)); } catch { /* ignore */ }
}