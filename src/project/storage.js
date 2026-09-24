const KEY = 'pride.project.v1';

export function saveProject(project) {
  try {
    const payload = {
      version: 5,
      scene:        project.scene.toJSON(),
      sheet:        project.sheet,
      vars:         project.vars,
      varsInitial:  project.varsInitial,
      name:         project.name        || 'Pride Project',
      canvasWidth:  project.canvasWidth  ?? 1024,
      canvasHeight: project.canvasHeight ?? 640,
      bgColor:      project.bgColor     || '#333333',
      gravityX:     project.gravityX ?? 0,
      gravityY:     project.gravityY ?? 980,
      hintsShown:   project.hintsShown || {},
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

    if (sceneData   === undefined) sceneData   = data;
    if (varsData    === undefined) varsData    = {};
    if (initialData === undefined) initialData = { ...varsData };

    project.scene.fromJSON(sceneData);
    project.sheet       = sheetData || null;
    project.vars        = { ...varsData };
    project.varsInitial = { ...initialData };

    project.name         = data.name        || 'Pride Project';
    project.canvasWidth  = data.canvasWidth  ?? 1024;
    project.canvasHeight = data.canvasHeight ?? 640;
    project.bgColor      = data.bgColor     || '#333333';
    project.gravityX     = data.gravityX ?? 0;
    project.gravityY     = data.gravityY ?? 980;
    project.hintsShown   = data.hintsShown || {};

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