const KEY = 'pride.project.v1';

function migrate(raw) {
  const data = JSON.parse(raw);
  if (data && data.version === 2) return data;
  // v1: поля scene на верхнем уровне
  return { version: 2, scene: data, sheet: null, vars: {} };
}

/**
 * project = { scene: Scene, sheet: object|null, vars: object }
 */
export function saveProject(project) {
  try {
    const payload = {
      version: 2,
      scene:  project.scene.toJSON(),
      sheet:  project.sheet,
      vars:   project.vars,
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
    const data = migrate(raw);
    project.scene.fromJSON(data.scene);
    project.sheet = data.sheet || null;
    project.vars  = data.vars  || {};
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