/**
 * Autosave проекта в localStorage.
 *
 * Один ключ на проект: `pride.project.<projectId>`. Проекты полностью
 * изолированы — удаление одного не затрагивает остальные.
 */

const KEY_PREFIX = 'pride.project.';
const LEGACY_KEY = 'pride.project.v1';

function keyFor(projectId) {
  return KEY_PREFIX + projectId;
}

/** Иконка — только dataURL. Старые id-строки не поддерживаем. */
function normalizeIcon(v) {
  if (typeof v !== 'string') return null;
  return v.startsWith('data:image/') ? v : null;
}

export function saveProject(project) {
  if (!project || !project.id) return false;
  try {
    const payload = {
      version: 9,
      id:           project.id,
      scene:        project.scene.toJSON(),
      sheet:        project.sheet,
      vars:         project.vars,
      varsInitial:  project.varsInitial,
      name:         project.name        || 'Pride Project',
      icon:         normalizeIcon(project.icon),
      canvasWidth:  project.canvasWidth  ?? 1024,
      canvasHeight: project.canvasHeight ?? 640,
      bgColor:      project.bgColor     || '#333333',
      gravityX:     project.gravityX ?? 0,
      gravityY:     project.gravityY ?? 980,
      hintsShown:   project.hintsShown || {},
      assetsScope:  project.assetsScope || null,
    };
    localStorage.setItem(keyFor(project.id), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[storage] save failed:', e);
    return false;
  }
}

export function loadProject(project, projectId) {
  if (!projectId) return false;
  const raw = localStorage.getItem(keyFor(projectId));
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);

    project.id          = projectId;
    project.scene.fromJSON(data.scene || { objects: [], layers: [{ id: 'default', name: 'Слой 1', visible: true }] });
    project.sheet       = data.sheet || null;
    project.vars        = { ...(data.vars || {}) };
    project.varsInitial = { ...(data.varsInitial || data.vars || {}) };

    project.name         = data.name         || 'Pride Project';
    project.icon         = normalizeIcon(data.icon);
    project.canvasWidth  = data.canvasWidth  ?? 1024;
    project.canvasHeight = data.canvasHeight ?? 640;
    project.bgColor      = data.bgColor      || '#333333';
    project.gravityX     = data.gravityX ?? 0;
    project.gravityY     = data.gravityY ?? 980;
    project.hintsShown   = data.hintsShown || {};
    project.assetsScope  = data.assetsScope || null;

    return true;
  } catch (e) {
    console.error('[storage] load failed:', e);
    return false;
  }
}

export function clearProject(projectId) {
  if (projectId) localStorage.removeItem(keyFor(projectId));
}

export function hasProject(projectId) {
  return !!projectId && localStorage.getItem(keyFor(projectId)) !== null;
}

export function clearAllProjects() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

// ---------- Миграция со старого формата ----------

export function hasLegacyProject() {
  return localStorage.getItem(LEGACY_KEY) !== null;
}

export function readLegacyProject() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function removeLegacyProject() {
  localStorage.removeItem(LEGACY_KEY);
}

export function importLegacyInto(projectId, legacyData) {
  if (!projectId || !legacyData) return false;
  try {
    const payload = {
      ...legacyData,
      id: projectId,
      version: 9,
      icon: normalizeIcon(legacyData.icon),
    };
    localStorage.setItem(keyFor(projectId), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[storage] migration failed:', e);
    return false;
  }
}

export function estimateProjectSize(projectId) {
  const raw = localStorage.getItem(keyFor(projectId));
  return raw ? raw.length : 0;
}