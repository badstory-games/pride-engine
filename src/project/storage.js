const KEY = 'pride.project.v1';

export function saveProject(scene) {
  try {
    const json = JSON.stringify(scene.toJSON());
    localStorage.setItem(KEY, json);
    return true;
  } catch (e) {
    console.error('[storage] save failed:', e);
    return false;
  }
}

export function loadProject(scene) {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    scene.fromJSON(JSON.parse(raw));
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