const KEY = 'pride.project.v1';

export function saveProject(project) {
  try {
    const payload = {
      version: 4,
      scene:       project.scene.toJSON(),
      sheet:       project.sheet,
      vars:        project.vars,
      varsInitial: project.varsInitial,
      gravityX:    project.gravityX ?? 0,
      gravityY:    project.gravityY ?? 980,
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

    let sceneData   = data.scene;
    let sheetData   = data.sheet;
    let varsData    = data.vars;
    let initialData = data.varsInitial;

    if (sceneData === undefined) sceneData = data;   // v1
    if (varsData  === undefined) varsData = {};      // v1 / v2
    if (initialData === undefined) initialData = { ...varsData };

    project.scene.fromJSON(sceneData);
    project.sheet = sheetData || null;
    project.vars = { ...varsData };
    project.varsInitial = { ...initialData };
    project.gravityX = data.gravityX ?? 0;
    project.gravityY = data.gravityY ?? 980;

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