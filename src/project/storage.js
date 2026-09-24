const KEY = 'pride.project.v1';

function migrate(raw) {
  const data = JSON.parse(raw);
  if (data && data.version === 2) {
    if (!data.vars) data.vars = {};
    if (!data.varsInitial) data.varsInitial = { ...data.vars };
    return data;
  }
  // v1: поля scene на верхнем уровне
  return { version: 2, scene: data, sheet: null, vars: {}, varsInitial: {} };
}

/**
 * project = {
 *   scene: Scene,
 *   sheet: object|null,
 *   vars: object,          — runtime значения
 *   varsInitial: object,   — начальные значения
 * }
 */
export function saveProject(project) {
  try {
    const payload = {
      version: 3,
      scene:       project.scene.toJSON(),
      sheet:       project.sheet,
      vars:        project.vars,
      varsInitial: project.varsInitial,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[storage] save failed:', e);
    return false;
  }
}

export function loadProject(project) {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);

    // --- миграции ---
    let sceneData   = data.scene;
    let sheetData   = data.sheet;
    let varsData    = data.vars;
    let initialData = data.varsInitial;

    // v1: сцена на верхнем уровне
    if (sceneData === undefined) sceneData = data;
    if (varsData === undefined) varsData = {};
    if (initialData === undefined) initialData = { ...varsData };

    project.scene.fromJSON(sceneData);
    project.sheet = sheetData || null;
    project.vars = { ...varsData };
    project.varsInitial = { ...initialData };

    return true;
  } catch (e) {
    console.error('[storage] load failed:', e);
    return false;
  }
}

export function hasProject() {
  return localStorage.getItem(KEY) !== null;
}

export function clearProject() {
  localStorage.removeItem(KEY);
}