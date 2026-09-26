import { Renderer } from './engine/renderer.js';
import { SpriteBatch } from './engine/sprite-batch.js';
import { GameLoop } from './engine/loop.js';
import { Camera } from './engine/camera.js';
import { AssetManager } from './engine/asset-manager.js';
import { AudioManager } from './engine/audio-manager.js';
import { drawGrid } from './engine/grid.js';
import { InputState } from './engine/input-state.js';
import { PhysicsBridge } from './engine/physics-bridge.js';
import { drawPhysicsDebug } from './engine/physics/debug-draw.js';

import { registry } from './engine/events/registry.js';
import { registerConditions } from './engine/events/conditions.js';
import { registerActions }    from './engine/events/actions.js';
import { EventRuntime }       from './engine/events/runtime.js';
import { TimerStore }         from './engine/events/timers.js';
import { defaultEventSheet }  from './engine/events/demo.js';
import { walkEvents }         from './engine/events/sheet-utils.js';

import { Scene } from './editor/scene.js';
import { Editor } from './editor/editor.js';
import { EditorController } from './editor/input.js';
import { drawOverlay } from './editor/overlay.js';
import { ShortcutsModal } from './editor/shortcuts-modal.js';
import { DocsModal } from './editor/docs-modal.js';
import { ExportModal } from './editor/export-modal.js';
import { Inspector } from './editor/inspector.js';
import { LayersPanel } from './editor/layers-panel.js';
import { Tabs } from './editor/tabs.js';
import { EventSheetPanel } from './editor/event-sheet-panel.js';
import { EventPalette }     from './editor/event-palette.js';
import { VarsPanel } from './editor/vars-panel.js';
import { History } from './editor/history.js';
import { PerfOverlay } from './editor/perf-overlay.js';
import { Profiler } from './editor/profiler.js';
import { ProfilerModal } from './editor/profiler-modal.js';
import { Clipboard } from './editor/clipboard.js';
import { TemplateModal } from './editor/template-modal.js';
import { getTemplate } from './editor/templates.js';
import { ProjectSettings } from './editor/project-settings.js';
import { AssetsPanel } from './editor/assets-panel.js';
import { runBenchmark, formatResults } from './editor/benchmark.js';
import { LoadingOverlay } from './editor/loading-overlay.js';
import { ProjectManagerModal } from './editor/project-manager-modal.js';
import { NoProjectScreen } from './editor/no-project-screen.js';
import { IconPickerModal } from './editor/icon-picker-modal.js';
import { makeIconDataUrl, isProjectIconDataUrl } from './editor/project-icons.js';

import {
  saveProject, loadProject, hasProject, clearProject,
  hasLegacyProject, readLegacyProject, removeLegacyProject,
  importLegacyInto,
} from './project/storage.js';
import {
  projectsDB, makeProjectId, makeAssetsScope,
} from './project/projects-db.js';
import {
  setCurrentProject as setCurrentSnapshotProject,
  deleteAllSnapshots,
  saveSnapshot, loadSnapshotData, applySnapshotToProject,
} from './project/snapshots.js';
import { serializeProject, deserializeProject } from './project/serializer.js';
import {
  downloadBlob, downloadBytes, pickFile,
} from './project/file-io.js';
import { exportWebGame } from './export/exporter.js';
import { Modal } from './editor/modal.js';
import { initIcons } from './editor/icons.js';
import { initTheme, getTheme, toggleTheme } from './editor/theme.js';
import { Tooltip } from './editor/tooltip.js';
import { computeDefaultParams } from './editor/param-defaults.js';
import { SnapshotsModal } from './editor/snapshots-modal.js';
import { logger } from './editor/logger.js';
import { LogPanel } from './editor/log-panel.js';
import { setHintsSaveCallback } from './editor/hints.js';

async function main() {
  initIcons();
  initTheme();
  const _tooltip = new Tooltip();

  logger.install();

  registerConditions();
  registerActions();

  // ---------- Infrastructure ----------
  const canvas   = document.getElementById('pride-canvas');
  const fpsEl    = document.getElementById('fps');
  const statusEl = document.getElementById('status-info');

  const leftPanel  = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');

  const renderer = new Renderer();
  await renderer.init(canvas);

  const camera = new Camera();
  camera.x = canvas.width / 2;
  camera.y = canvas.height / 2;
  camera.zoom = 1;

  const assets = new AssetManager(renderer.device, {
    onTextureDisposed: (texture) => renderer.releaseTexture(texture),
  });

  const audio = new AudioManager();

  const gridBatch    = new SpriteBatch(renderer.device, renderer.format);
  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const overlayBatch = new SpriteBatch(renderer.device, renderer.format);
  const physicsBatch = new SpriteBatch(renderer.device, renderer.format);
  const allBatches = [gridBatch, spriteBatch, overlayBatch, physicsBatch];

  function refreshWhiteUV() {
    const uv = assets.get('__white');
    if (!uv) return;
    for (const b of allBatches) b.setWhiteUV(uv);
  }

  // ---------- Project state ----------
  const scene = new Scene();
  const project = {
    id: null,
    icon: null,
    scene,
    sheet: null,
    vars: {}, varsInitial: {},
    name: 'Pride Project',
    canvasWidth:  canvas.width,
    canvasHeight: canvas.height,
    bgColor: '#333333',
    gravityX: 0,
    gravityY: 980,
    hintsShown: {},
    assetsScope: null,
  };

  // ---------- Editor ----------
  const editor  = new Editor(scene);
  const controller = new EditorController(canvas, camera, editor);
  const bridge  = new PhysicsBridge(scene, {
    gravityX: project.gravityX,
    gravityY: project.gravityY,
  });
  const timers  = new TimerStore();
  const clipboard = new Clipboard();
  const templateModal = new TemplateModal();
  const snapshotsModal = new SnapshotsModal();
  const exportModal = new ExportModal();
  const iconPicker = new IconPickerModal({ assets, editor });

  const perfOverlay = new PerfOverlay(document.getElementById('canvas-wrap'));
  const profiler = new Profiler();
  const profilerModal = new ProfilerModal();

  perfOverlay.onFrame = (f, u, r) => profiler.capture(f, u, r);
  profiler.onProgress = (t, total) => profilerModal.setProgress(t, total);
  profiler.onFinish   = (report) => profilerModal.showReport(report);

  const logPanel = new LogPanel(document.getElementById('log-panel'));
  document.getElementById('btn-logs').addEventListener('click', () => logPanel.toggle());

  window.LoadingOverlay = LoadingOverlay;
  window.__pride = {
    get scene()   { return scene; },
    get project() { return project; },
    get editor()  { return editor; },
    get bridge()  { return bridge; },
    get audio()   { return audio; },
    get assets()  { return assets; },
    get runtime() { return eventRuntime; },
    get history() { return history; },
    LoadingOverlay,
    projectsDB,
  };

  function hexToRgb01(hex) {
    const clean = String(hex).replace(/^#/, '');
    const n = parseInt(clean, 16);
    return {
      r: ((n >> 16) & 0xff) / 255,
      g: ((n >>  8) & 0xff) / 255,
      b: ( n        & 0xff) / 255,
    };
  }

  function applyCanvasSize(w, h) {
    if (canvas.width !== w)   canvas.width = w;
    if (canvas.height !== h)  canvas.height = h;
    camera.x = w / 2;
    camera.y = h / 2;
  }

  function applyBgColor(hex) {
    const { r, g, b } = hexToRgb01(hex);
    renderer.setClearColor(r, g, b, 1.0);
  }

  function applyGravity(gx, gy) {
    bridge.setGravity(gx, gy);
  }

  const input = new InputState();

  function isEditableTarget() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
  }

  // [FIX] Проверка: активный элемент — кнопка или ссылка? На них Space
  // должен активировать элемент, а не превращаться в игровой ввод.
  function isButtonLike() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'BUTTON' || tag === 'A';
  }

  window.addEventListener('keydown', (e) => {
    if (isEditableTarget()) return;
    if (e.repeat) return;
    // [FIX] Только если фокус не на кнопке/ссылке — перехватываем Space.
    if (e.code === 'Space' && !isButtonLike()) e.preventDefault();
    input.press(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (isEditableTarget()) return;
    input.release(e.code);
  });

  function wakeAudio() { audio.resume(); }
  window.addEventListener('pointerdown', wakeAudio, { capture: true });
  window.addEventListener('keydown',      wakeAudio, { capture: true });

  const eventRuntime = new EventRuntime(null, (dt) => ({
    world: bridge.world,
    scene,
    input,
    vars:  project.vars,
    timers,
    audio,
    endedSounds: audio.drainEnded(),
    dt,
    time:  performance.now() / 1000,
    spawnBodyFor:   (obj) => bridge.spawnBodyFor(obj),
    destroyBodyFor: (id)  => bridge.destroyBodyFor(id),
  }));

  // ---------- UI panels ----------
  const inspector = new Inspector(
    document.getElementById('inspector-content'), editor, scene);

  const layersPanel = new LayersPanel(
    document.getElementById('layers-panel'), editor, scene);

  const assetsPanel = new AssetsPanel(
    document.getElementById('assets-panel'),
    assets, editor, scene, audio
  );
  assetsPanel.onChange = () => {
    inspector.setTextures(assets.listIds());
    inspector.refresh();
    refreshWhiteUV();
  };
  assetsPanel.onChange();

  // [FIX] Не перезаписываем audio.onStateChange — AssetsPanel уже
  // подписался в своём конструкторе через _prevStateChange. Наш
  // колбэк добавляется поверх, чтобы не сломать ту подписку.
  const _prevAudioStateChange = audio.onStateChange;
  audio.onStateChange = () => {
    if (_prevAudioStateChange) {
      try { _prevAudioStateChange(); } catch {}
    }
    if (assetsPanel.refreshAudio) assetsPanel.refreshAudio();
  };

  const projectSettings = new ProjectSettings(
    document.getElementById('project-settings-panel'),
    project,
    {
      onCanvasSizeChange: (w, h) => applyCanvasSize(w, h),
      onBgColorChange:    (hex)  => applyBgColor(hex),
      onGravityChange:    (gx, gy) => applyGravity(gx, gy),
      onNameChange:       (name) => {
        document.title = `Pride Engine — ${name}`;
      },
    }
  );

  projectSettings.onRequestIconPick = async () => {
    const result = await iconPicker.pick();
    if (!result) return;

    if (result.type === 'default') {
      if (!isProjectIconDataUrl(project.icon)) return;
      const h = editor.history;
      const apply = () => { project.icon = null; };
      if (h) h.run('Project: icon', apply); else apply();
      projectSettings.refresh();
      scheduleSave();
      return;
    }

    if (result.type === 'asset') {
      const blob = assets.getSourceBlob(result.assetId);
      const dataUrl = await makeIconDataUrl(blob);
      if (!dataUrl) return;
      const h = editor.history;
      const apply = () => { project.icon = dataUrl; };
      if (h) h.run('Project: icon', apply); else apply();
      projectSettings.refresh();
      scheduleSave();
    }
  };

  const shortcutsModal = new ShortcutsModal();
  document.getElementById('btn-shortcuts')
    .addEventListener('click', () => shortcutsModal.toggle());
  controller.onToggleShortcuts = () => shortcutsModal.toggle();
  controller.isShortcutsOpen  = () => shortcutsModal.isOpen;

  const docsModal = new DocsModal();
  document.getElementById('btn-docs')
    .addEventListener('click', () => docsModal.toggle());

  const eventSheetPanel = new EventSheetPanel(
    document.getElementById('event-sheet-main'),
    project, eventRuntime, scene, assets
  );
  eventSheetPanel.onChange = () => scheduleSave();

  const eventPalette = new EventPalette(
    document.getElementById('event-palette'),
    async (kind, type) => {
      const sheet = project.sheet;
      if (!sheet) return;

      let first = null;
      walkEvents(sheet.events || [], (ev) => { if (!first) first = ev; });

      if (!first) {
        await Modal.alert({
          title: 'Нет активного события',
          message: 'Сначала нажмите «+ Событие» в центре экрана, чтобы создать событие, а затем добавляйте в него условия и действия.',
          okText: 'Понятно',
        });
        return;
      }

      const map = kind === 'conditions' ? registry.conditions : registry.actions;
      const def = map.get(type);
      if (!def) return;

      const h = editor.history;
      const apply = () => {
        const params = computeDefaultParams(def, {
          scene,
          vars: project.vars || {},
          assets,
        });
        if (kind === 'conditions') {
          first.conditions = first.conditions || [];
          first.conditions.push({ type, params });
        } else {
          first.actions = first.actions || [];
          first.actions.push({ type, params });
        }
      };
      if (h) h.run('Add ' + kind, apply); else apply();

      eventRuntime.setSheet(sheet);
      eventSheetPanel.refresh();
      scheduleSave();
    }
  );
  eventPalette.attachDnD();

  const varsPanel = new VarsPanel(
    document.getElementById('vars-panel'),
    project
  );

  inspector.onObjectRenamed = (oldName, newName) => {
    eventSheetPanel.renameObjectRefs(oldName, newName);
  };
  inspector.onInstVarRenamed = (objName, oldName, newName) => {
    eventSheetPanel.renameInstanceVarRefs(objName, oldName, newName);
  };
  varsPanel.onVarRenamed = (oldName, newName) => {
    eventSheetPanel.renameGlobalVarRefs(oldName, newName);
  };
  assetsPanel.onAudioRenamed = (oldId, newId) => {
    if (newId) eventSheetPanel.renameSoundRefs(oldId, newId);
    else eventSheetPanel.refresh();
  };

  varsPanel.onChange = () => {
    eventSheetPanel.refresh();
    inspector.refresh();
    scheduleSave();
  };

  // ---------- History ----------
  const history = new History({
    snapshotFn: () => structuredClone({
      scene:        scene.toJSON(),
      sheet:        project.sheet,
      varsInitial:  project.varsInitial,
      selection:    [...editor.selection],
      name:         project.name,
      icon:         project.icon,
      canvasWidth:  project.canvasWidth,
      canvasHeight: project.canvasHeight,
      bgColor:      project.bgColor,
      gravityX:     project.gravityX,
      gravityY:     project.gravityY,
    }),
    restoreFn: (state) => {
      const s = structuredClone(state);
      scene.fromJSON(s.scene);
      project.sheet       = s.sheet;
      project.varsInitial = s.varsInitial;
      project.name         = s.name;
      project.icon         = s.icon || null;
      project.canvasWidth  = s.canvasWidth;
      project.canvasHeight = s.canvasHeight;
      project.bgColor      = s.bgColor;
      project.gravityX     = s.gravityX;
      project.gravityY     = s.gravityY;

      applyCanvasSize(project.canvasWidth, project.canvasHeight);
      applyBgColor(project.bgColor);
      applyGravity(project.gravityX, project.gravityY);
      document.title = `Pride Engine — ${project.name}`;

      editor.selection.clear();
      for (const id of s.selection) editor.selection.add(id);

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      inspector.refresh();
      layersPanel.refresh();
      projectSettings.refresh();
      scheduleSave();
    },
    limit: 100,
    isLocked: () => editor.locked,
  });

  editor.history          = history;
  varsPanel.history       = history;
  eventSheetPanel.history = history;
  projectSettings.history = history;
  projectSettings.onChange = () => scheduleSave();

  // ---------- Save indicator ----------
  const saveIndicator = document.getElementById('save-indicator');
  let saveTimer = 0;

  function setIndicator(cls, text) {
    saveIndicator.className = 'save-indicator ' + cls;
    saveIndicator.textContent = text;
  }

  function scheduleSave() {
    if (!project.id) return;
    setIndicator('dirty', '● unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (saveProject(project)) {
        setIndicator('saved', '✓ saved ' + new Date().toLocaleTimeString());
        projectsDB.put(currentProjectMeta()).catch(() => {});
      } else {
        setIndicator('error', '✕ save error');
      }
    }, 500);
  }

  setHintsSaveCallback(scheduleSave);

  function currentProjectMeta() {
    const objects = scene.objects.filter((o) => !o._dead).length;
    return {
      id:          project.id,
      name:        project.name,
      icon:        isProjectIconDataUrl(project.icon) ? project.icon : null,
      createdAt:   project._createdAt || Date.now(),
      updatedAt:   Date.now(),
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      bgColor:     project.bgColor,
      objectCount: objects,
      eventCount:  countEventsInSheet(project.sheet),
      assetsScope: project.assetsScope,
    };
  }

  function countEventsInSheet(sheet) {
    if (!sheet || !Array.isArray(sheet.events)) return 0;
    let n = 0;
    const walk = (arr) => {
      for (const el of arr) {
        if ((el._type || 'event') === 'event') n++;
        if (el.children) walk(el.children);
      }
    };
    walk(sheet.events);
    return n;
  }

  // ---------- Topbar ----------
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  function refreshUndoButtons() {
    if (!btnUndo || !btnRedo) return;
    btnUndo.disabled = !history.canUndo() || editor.locked;
    btnRedo.disabled = !history.canRedo() || editor.locked;
  }
  history.onChange = () => refreshUndoButtons();
  btnUndo.addEventListener('click', () => history.undo());
  btnRedo.addEventListener('click', () => history.redo());

  const btnTheme = document.getElementById('btn-theme');
  function refreshThemeIcon() {
    const t = getTheme();
    btnTheme.innerHTML = `<svg class="icon"><use href="#icon-${t === 'dark' ? 'sun' : 'moon'}"/></svg>`;
    btnTheme.title = t === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  }
  btnTheme.addEventListener('click', () => { toggleTheme(); refreshThemeIcon(); });
  refreshThemeIcon();

  const toolButtons = document.querySelectorAll('.tool');
  function refreshToolButtons() {
    toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === editor.tool));
  }
  toolButtons.forEach((b) => {
    b.addEventListener('click', () => controller.setTool(b.dataset.tool));
  });
  refreshToolButtons();

  function doProfile() {
    if (profiler.isRecording) return;
    if (profilerModal.isOpen) return;
    profilerModal.open({ duration: 5, onCancel: () => profiler.cancel() });
    profiler.start(5);
  }
  document.getElementById('btn-profiler').addEventListener('click', doProfile);

  // ---------- Tabs ----------
  const eventSheetView      = document.getElementById('event-sheet-view');
  const projectSettingsView = document.getElementById('project-settings-view');
  const assetsView          = document.getElementById('assets-view');

  const tabs = new Tabs(document.getElementById('view-tabs'), (id) => {
    const isLayout   = id === 'layout';
    const isEvents   = id === 'event-sheet';
    const isAssets   = id === 'assets';
    const isSettings = id === 'settings';

    canvas.hidden              = !isLayout;
    eventSheetView.hidden      = !isEvents;
    assetsView.hidden          = !isAssets;
    projectSettingsView.hidden = !isSettings;

    const sideDisplay = isLayout ? '' : 'none';
    leftPanel.style.display  = sideDisplay;
    rightPanel.style.display = sideDisplay;

    if (isEvents)   eventSheetPanel.refresh();
    if (isAssets)   assetsPanel.refresh();
    if (isSettings) projectSettings.refresh();
  });

  // ---------- Play controls ----------
  const btnPlay  = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnStop  = document.getElementById('btn-stop');
  const btnDebug = document.getElementById('btn-debug');
  let debugDraw = true;

  function refreshPlayButtons() {
    btnPlay.classList.toggle('active', bridge.running && !bridge.paused);
    btnPause.classList.toggle('active', bridge.running && bridge.paused);
    btnStop.classList.toggle('danger', bridge.running);
    btnStop.disabled  = !bridge.running;
    btnPause.disabled = !bridge.running;
    btnDebug.classList.toggle('toggled', debugDraw);
    refreshUndoButtons();
  }

  function doPlay() {
    if (!project.id) return;
    if (!bridge.running) {
      tabs.select('layout');
      for (const k of Object.keys(project.vars)) delete project.vars[k];
      Object.assign(project.vars, project.varsInitial);
      audio.resume();
      bridge.start();
      editor.locked = true;
      editor.clearSelection();
      input.clear();
      timers.clear();
      eventRuntime.reset();
      varsPanel.setRunning(true);
      varsPanel.refresh();
    } else if (bridge.paused) {
      bridge.resume();
      audio.resume();
    }
    refreshPlayButtons();
  }

  function doPause() {
    if (bridge.running && !bridge.paused) {
      bridge.pause();
      audio.suspend();
    }
    refreshPlayButtons();
  }

  function doStop() {
    if (bridge.running) bridge.stop();
    audio.stopAll();
    for (const k of Object.keys(project.vars)) delete project.vars[k];
    Object.assign(project.vars, project.varsInitial);
    editor.locked = false;
    timers.clear();
    eventRuntime.reset();
    input.clear();
    refreshPlayButtons();
    varsPanel.setRunning(false);
    varsPanel.refresh();
    editor.onChange();
  }

  btnPlay .addEventListener('click', doPlay);
  btnPause.addEventListener('click', doPause);
  btnStop .addEventListener('click', doStop);
  btnDebug.addEventListener('click', () => {
    debugDraw = !debugDraw;
    refreshPlayButtons();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!bridge.running) return;
    if (e.target.closest && e.target.closest('#pride-canvas')) return;
    if (e.target.closest && e.target.closest('#play-controls')) return;
    if (e.target.closest && e.target.closest('.modal-backdrop')) return;
    if (e.target.closest && e.target.closest('.no-project-screen')) return;
    doStop();
  }, true);

  // ---------- No-project screen ----------
  const noProjectScreen = new NoProjectScreen({
    onCreateProject: () => (async () => {
      const tplId = await templateModal.pick();
      if (tplId) await createNewProject(tplId);
    })(),
    onManageProjects: () => projectManager.open(),
  });

  function syncNoProjectScreen() {
    const hasProject  = !!project.id;
    const managerOpen = projectManager.isOpen();

    document.documentElement.setAttribute(
      'data-app',
      hasProject ? 'ready' : 'boot'
    );

    if (!hasProject && !managerOpen) {
      noProjectScreen.show();
    } else {
      noProjectScreen.hide();
    }
  }

  // ---------- Project management ----------

  async function switchToProject(id, { silent = false } = {}) {
    if (bridge.running) doStop();

    if (project.id && project.id !== id) {
      saveProject(project);
      try { await projectsDB.put(currentProjectMeta()); } catch {}
    }

    if (!loadProject(project, id)) {
      if (!silent) {
        await Modal.alert({
          title: 'Не удалось загрузить проект',
          message: 'Данные проекта повреждены или удалены.',
          okText: 'Закрыть',
        });
      }
      syncNoProjectScreen();
      return false;
    }

    project.id = id;
    setCurrentSnapshotProject(id);
    await projectsDB.setMeta('lastOpened', id);

    if (!project.sheet)       project.sheet       = defaultEventSheet();
    if (!project.vars)        project.vars        = {};
    if (!project.varsInitial) project.varsInitial = { ...project.vars };
    if (!project.assetsScope) project.assetsScope = makeAssetsScope();

    applyCanvasSize(project.canvasWidth, project.canvasHeight);
    applyBgColor(project.bgColor);
    applyGravity(project.gravityX, project.gravityY);
    document.title = `Pride Engine — ${project.name}`;

    await assets.useScope(project.assetsScope);
    refreshWhiteUV();

    audio.clear();
    audio.queueDecodeMany(
      assets.listAudioIds().map((aid) => ({ id: aid, bytes: assets.getAudioBytes(aid) }))
    );
    assetsPanel.refreshAudio();

    eventRuntime.setSheet(project.sheet);
    eventSheetPanel.refresh();
    varsPanel.refresh();
    assetsPanel.refresh();
    projectSettings.refresh();
    inspector.refresh();
    layersPanel.refresh();
    editor.clearSelection();
    editor.onChange();

    history.init();
    setIndicator('saved', '✓ loaded');
    syncNoProjectScreen();
    return true;
  }

  async function createNewProject(templateId) {
    if (!templateId) return;

    const tpl = getTemplate(templateId);
    if (!tpl) return;

    LoadingOverlay.show('Создание проекта…', { immediate: true });
    try {
      if (bridge.running) doStop();

      if (project.id) {
        saveProject(project);
        try { await projectsDB.put(currentProjectMeta()); } catch {}
      }

      const id = makeProjectId();
      const scope = makeAssetsScope();

      clearProject(id);

      const fresh = tpl.create();
      scene.fromJSON(fresh.scene);

      project.id           = id;
      project.icon         = null;
      project.sheet        = fresh.sheet;
      project.vars         = {};
      project.varsInitial  = structuredClone(fresh.varsInitial || {});
      project.name         = tpl.name || 'Новый проект';
      project.canvasWidth  = 1024;
      project.canvasHeight = 640;
      project.bgColor      = '#333333';
      project.gravityX     = fresh.gravityX ?? 0;
      project.gravityY     = fresh.gravityY ?? 980;
      project.hintsShown   = {};
      project.assetsScope  = scope;
      project._createdAt   = Date.now();

      setCurrentSnapshotProject(id);
      saveProject(project);

      await projectsDB.put({
        id,
        name:        project.name,
        icon:        null,
        createdAt:   project._createdAt,
        updatedAt:   Date.now(),
        canvasWidth: project.canvasWidth,
        canvasHeight: project.canvasHeight,
        bgColor:     project.bgColor,
        objectCount: scene.objects.length,
        eventCount:  0,
        assetsScope: scope,
      });
      await projectsDB.setMeta('lastOpened', id);

      await assets.useScope(scope);
      refreshWhiteUV();

      audio.clear();

      applyCanvasSize(project.canvasWidth, project.canvasHeight);
      applyBgColor(project.bgColor);
      applyGravity(project.gravityX, project.gravityY);
      document.title = `Pride Engine — ${project.name}`;

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      assetsPanel.refresh();
      projectSettings.refresh();
      editor.clearSelection();
      editor.onChange();
      history.init();
      setIndicator('saved', '✓ new');

      if (projectManager.isOpen()) projectManager.close();
      syncNoProjectScreen();
    } catch (e) {
      console.error('[project] create failed:', e);
      await Modal.alert({
        title: 'Не удалось создать проект',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    } finally {
      LoadingOverlay.hide();
    }
  }

  async function duplicateProject(srcId) {
    LoadingOverlay.show('Дублирование…', { immediate: true });
    try {
      if (project.id === srcId) saveProject(project);

      const raw = localStorage.getItem('pride.project.' + srcId);
      if (!raw) {
        await Modal.alert({ title: 'Ошибка', message: 'Исходный проект не найден.', okText: 'Ок' });
        return;
      }

      const data = JSON.parse(raw);
      const newId = makeProjectId();
      const newScope = makeAssetsScope();

      data.id = newId;
      data.assetsScope = newScope;
      data.name = (data.name || 'Проект') + ' (копия)';

      localStorage.setItem('pride.project.' + newId, JSON.stringify(data));

      await copyAssetsScope(srcId, newScope);

      await projectsDB.put({
        id:          newId,
        name:        data.name,
        icon:        isProjectIconDataUrl(data.icon) ? data.icon : null,
        createdAt:   Date.now(),
        updatedAt:   Date.now(),
        canvasWidth: data.canvasWidth  ?? 1024,
        canvasHeight: data.canvasHeight ?? 640,
        bgColor:     data.bgColor ?? '#333333',
        objectCount: (data.scene?.objects || []).length,
        eventCount:  countEventsInSheet(data.sheet),
        assetsScope: newScope,
      });
    } catch (e) {
      console.error('[project] duplicate failed:', e);
      await Modal.alert({
        title: 'Не удалось дублировать',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    } finally {
      LoadingOverlay.hide();
    }
  }

  async function copyAssetsScope(srcProjectId, newScope) {
    const srcMeta = await projectsDB.get(srcProjectId);
    const srcScope = srcMeta && srcMeta.assetsScope;
    if (!srcScope) return;

    const db = await assets._dbReady;
    if (!db) return;

    const copy = (storeName) => new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const srcPrefix = srcScope + ':';
      const dstPrefix = newScope + ':';
      const out = [];
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          const k = String(cur.key);
          if (k.startsWith(srcPrefix)) {
            const id = k.slice(srcPrefix.length);
            out.push({ newKey: dstPrefix + id, value: cur.value });
          }
          cur.continue();
        } else {
          for (const e of out) store.put(e.value, e.newKey);
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    await copy('blobs');
    await copy('audio');
  }

  async function renameProject(id, newName) {
    try {
      const meta = await projectsDB.get(id);
      if (!meta) return;
      meta.name = newName;
      meta.updatedAt = Date.now();
      await projectsDB.put(meta);

      if (project.id === id) {
        project.name = newName;
        document.title = `Pride Engine — ${newName}`;
        saveProject(project);
        projectSettings.refresh();
      }
    } catch (e) {
      console.error('[project] rename failed:', e);
    }
  }

  async function deleteProject(id) {
    LoadingOverlay.show('Удаление…', { immediate: true });
    try {
      const meta = await projectsDB.get(id);
      const wasCurrent = (project.id === id);
      if (wasCurrent && bridge.running) doStop();

      clearProject(id);
      deleteAllSnapshots(id);

      if (meta && meta.assetsScope) {
        await assets.deleteScope(meta.assetsScope);
      }

      await projectsDB.delete(id);

      if (wasCurrent) {
        project.id = null;
        project.icon = null;
        setCurrentSnapshotProject(null);
        await projectsDB.setMeta('lastOpened', null);

        scene.fromJSON({ objects: [], layers: [{ id: 'default', name: 'Слой 1', visible: true }] });
        project.sheet = defaultEventSheet();
        project.vars = {};
        project.varsInitial = {};
        project.name = 'Pride Project';
        project.assetsScope = null;

        eventRuntime.setSheet(project.sheet);
        eventSheetPanel.refresh();
        varsPanel.refresh();
        assetsPanel.refresh();
        editor.clearSelection();
        editor.onChange();
        history.init();
      }
    } catch (e) {
      console.error('[project] delete failed:', e);
    } finally {
      LoadingOverlay.hide();
      syncNoProjectScreen();
    }
  }

  // ---------- Project Manager ----------
  const projectManager = new ProjectManagerModal({
    getCurrentProjectId: () => project.id,
    listProjects:        () => projectsDB.list(),
    onOpen:              (id) => switchToProject(id),
    onCreateNew:         () => (async () => {
      const tplId = await templateModal.pick();
      if (tplId) await createNewProject(tplId);
    })(),
    onDuplicate:         (id) => duplicateProject(id),
    onRename:            (id, newName) => renameProject(id, newName),
    onDelete:            (id) => deleteProject(id),
    onClose:             () => syncNoProjectScreen(),
  });

  document.getElementById('btn-projects')
    .addEventListener('click', () => projectManager.open());

  // ---------- Snapshots ----------
  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!project.id) return;

    const defaultName = 'Снимок ' + new Date().toLocaleString();
    const name = await snapshotsModal.promptSave(defaultName);
    if (name === null) return;

    const finalName = String(name).trim() || defaultName;

    LoadingOverlay.show('Сохранение снимка…', { immediate: true });
    try {
      saveSnapshot(project, finalName);
      setIndicator('saved', '✓ snapshot saved');
    } catch (e) {
      console.error('[snapshot] save failed:', e);
      setIndicator('error', '✕ snapshot save error');
    } finally {
      LoadingOverlay.hide();
    }
  });

  document.getElementById('btn-load').addEventListener('click', async () => {
    if (!project.id) return;

    const result = await snapshotsModal.pick();
    if (!result || result.action !== 'restore') return;

    const snapshot = loadSnapshotData(result.id);
    if (!snapshot) {
      await Modal.alert({
        title: 'Снимок недоступен',
        message: 'Не удалось прочитать снимок. Возможно, он повреждён или удалён.',
        okText: 'Закрыть',
      });
      return;
    }

    LoadingOverlay.show('Восстановление снимка…', { immediate: true });
    try {
      if (!applySnapshotToProject(snapshot, project)) {
        setIndicator('error', '✕ snapshot corrupted');
        return;
      }

      editor.clearSelection();
      if (!project.sheet) project.sheet = defaultEventSheet();
      if (!project.assetsScope) project.assetsScope = makeAssetsScope();

      await assets.useScope(project.assetsScope);
      refreshWhiteUV();

      audio.clear();
      audio.queueDecodeMany(
        assets.listAudioIds().map((aid) => ({ id: aid, bytes: assets.getAudioBytes(aid) }))
      );
      assetsPanel.refreshAudio();

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      assetsPanel.refresh();
      projectSettings.refresh();

      applyCanvasSize(project.canvasWidth, project.canvasHeight);
      applyBgColor(project.bgColor);
      applyGravity(project.gravityX, project.gravityY);
      document.title = `Pride Engine — ${project.name}`;

      setIndicator('saved', '✓ snapshot restored');
      editor.onChange();
      history.init();
    } finally {
      LoadingOverlay.hide();
    }
  });

  document.getElementById('btn-new').addEventListener('click', async () => {
    const templateId = await templateModal.pick();
    if (!templateId) return;
    await createNewProject(templateId);
  });

  // ---------- .pride save/open ----------
  async function doSavePride() {
    if (!project.id) return;
    LoadingOverlay.show('Сохранение проекта…', { immediate: true });
    try {
      scene.flush();
      const bytes = await serializeProject(project);
      downloadBytes(bytes, 'project.pride', 'application/octet-stream');
      setIndicator('saved', '✓ .pride');
    } catch (e) {
      console.error('[save .pride]', e);
      setIndicator('error', '✕ save error');
    } finally {
      LoadingOverlay.hide();
    }
  }

  async function doOpenPride() {
    let file;
    try {
      file = await pickFile('.pride,application/octet-stream');
    } catch (e) {
      console.error('[open .pride] pickFile:', e);
      return;
    }
    if (!file) return;

    LoadingOverlay.show('Загрузка проекта…', { immediate: true });
    try {
      const bytes  = await file.arrayBuffer();
      const loaded = await deserializeProject(new Uint8Array(bytes), scene);

      if (bridge.running) doStop();

      if (project.id) {
        saveProject(project);
        try { await projectsDB.put(currentProjectMeta()); } catch {}
      }

      const id = makeProjectId();
      const scope = makeAssetsScope();

      project.id           = id;
      project.icon         = isProjectIconDataUrl(loaded.icon) ? loaded.icon : null;
      project.sheet        = loaded.sheet || defaultEventSheet();
      project.vars         = loaded.vars || {};
      project.varsInitial  = loaded.varsInitial || { ...(loaded.vars || {}) };
      project.name         = loaded.name || 'Импортированный проект';
      project.canvasWidth  = loaded.canvasWidth;
      project.canvasHeight = loaded.canvasHeight;
      project.bgColor      = loaded.bgColor;
      project.gravityX     = loaded.gravityX;
      project.gravityY     = loaded.gravityY;
      project.hintsShown   = {};
      project.assetsScope  = scope;
      project._createdAt   = Date.now();

      setCurrentSnapshotProject(id);
      saveProject(project);

      await projectsDB.put({
        id,
        name:        project.name,
        icon:        project.icon,
        createdAt:   project._createdAt,
        updatedAt:   Date.now(),
        canvasWidth: project.canvasWidth,
        canvasHeight: project.canvasHeight,
        bgColor:     project.bgColor,
        objectCount: scene.objects.length,
        eventCount:  countEventsInSheet(project.sheet),
        assetsScope: scope,
      });
      await projectsDB.setMeta('lastOpened', id);

      await assets.useScope(scope);
      refreshWhiteUV();

      audio.clear();

      applyCanvasSize(project.canvasWidth, project.canvasHeight);
      applyBgColor(project.bgColor);
      applyGravity(project.gravityX, project.gravityY);
      document.title = `Pride Engine — ${project.name}`;

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      assetsPanel.refresh();
      projectSettings.refresh();
      editor.clearSelection();
      editor.onChange();
      history.init();
      setIndicator('saved', '✓ .pride imported');

      if (projectManager.isOpen()) projectManager.close();
      syncNoProjectScreen();
    } catch (e) {
      console.error('[open .pride]', e);
      setIndicator('error', '✕ load error');
      await Modal.alert({
        title: 'Не удалось открыть файл',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    } finally {
      LoadingOverlay.hide();
    }
  }

  async function doExportGame() {
    if (!project.id) return;
    const opts = await exportModal.pick();
    if (!opts) return;

    setIndicator('dirty', '● exporting…');
    LoadingOverlay.show('Экспорт игры…', { immediate: true });
    try {
      scene.flush();
      const { blob, filename } = await exportWebGame(project, {
        title: project.name || 'Pride Game',
        debugDraw: false,
        showSplash:   opts.showSplash,
        debugOverlay: opts.debugOverlay,
        debugPhysics: opts.debugPhysics,
        minify:       opts.minify,
        mode:         opts.mode,
        assetManager: assets,
      });
      downloadBlob(blob, filename);
      setIndicator('saved', '✓ exported');
    } catch (e) {
      console.error('[export]', e);
      setIndicator('error', '✕ export error');
      await Modal.alert({
        title: 'Экспорт не удался',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    } finally {
      LoadingOverlay.hide();
    }
  }

  document.getElementById('btn-save-pride').addEventListener('click', doSavePride);
  document.getElementById('btn-open-pride').addEventListener('click', doOpenPride);
  document.getElementById('btn-export')    .addEventListener('click', doExportGame);

  // ---------- Benchmark ----------
  async function doBenchmark() {
    if (!project.id) return;
    if (bridge.running) {
      await Modal.alert({
        title: 'Бенчмарк недоступен',
        message: 'Остановите Play (F7) перед запуском бенчмарка.',
        okText: 'Понятно',
      });
      return;
    }

    const ok = await Modal.confirm({
      title: 'Запустить бенчмарк?',
      message:
        'Будет временно создано до 5000 объектов и прогнано ~5 секунд симуляции. ' +
        'Сцена восстановится автоматически. Не редактируйте её во время теста.',
      okText: 'Запустить',
      cancelText: 'Отмена',
    });
    if (!ok) return;

    setIndicator('dirty', '● benchmark…');
    LoadingOverlay.show('Бенчмарк…', { immediate: true });
    try {
      const results = await runBenchmark({
        scene, bridge, perfOverlay,
        setDebugDraw: (v) => {
          const prev = debugDraw;
          if (v !== null) {
            debugDraw = v;
            refreshPlayButtons();
          }
          return prev;
        },
        counts: [500, 1000, 2500, 5000],
        framesPerTest: 90,
      });
      setIndicator('saved', '✓ benchmark done');
      await Modal.alert({
        title: 'Результаты бенчмарка',
        message: formatResults(results),
        okText: 'Закрыть',
      });
    } catch (e) {
      console.error('[benchmark]', e);
      setIndicator('error', '✕ benchmark error');
      await Modal.alert({
        title: 'Бенчмарк не удался',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    } finally {
      LoadingOverlay.hide();
    }
  }

  // ---------- Global keyboard ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (e.code === 'F2')  { e.preventDefault(); docsModal.toggle(); return; }
    if (e.code === 'F3')  { e.preventDefault(); doProfile();       return; }
    if (e.code === 'F8')  { e.preventDefault(); perfOverlay.toggle(); return; }
    if (e.code === 'F9')  { e.preventDefault(); doBenchmark();      return; }
    if (e.code === 'F10') { e.preventDefault(); logPanel.toggle(); return; }

    const inField = isEditableTarget();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.code === 'KeyZ' && !inField) {
      e.preventDefault();
      if (e.shiftKey) history.redo(); else history.undo();
      return;
    }
    if (mod && e.code === 'KeyY' && !inField) {
      e.preventDefault();
      history.redo();
      return;
    }

    if (mod && !inField) {
      if (e.code === 'KeyC') { e.preventDefault(); clipboard.copy(editor, scene);      return; }
      if (e.code === 'KeyX') { e.preventDefault(); clipboard.cut(editor, scene);       return; }
      if (e.code === 'KeyV') { e.preventDefault(); clipboard.paste(editor, scene);     return; }
      if (e.code === 'KeyD') { e.preventDefault(); clipboard.duplicate(editor, scene); return; }
    }

    if (mod && e.code === 'KeyS') { e.preventDefault(); doSavePride();  return; }
    if (mod && e.code === 'KeyO') { e.preventDefault(); doOpenPride();  return; }
    if (mod && e.code === 'KeyE') { e.preventDefault(); doExportGame(); return; }

    if (e.code === 'F5')      { e.preventDefault(); doPlay();  }
    else if (e.code === 'F6') { e.preventDefault(); doPause(); }
    else if (e.code === 'F7') { e.preventDefault(); doStop();  }
  });

  // ---------- editor.onChange hook ----------
  editor.onChange = () => {
    refreshToolButtons();
    inspector.refresh();
    layersPanel.refresh();
    varsPanel.refresh();
    assetsPanel.refresh();
    eventSheetPanel.refresh();
    scheduleSave();
  };

  // ---------- Initial panels ----------
  inspector.refresh();
  layersPanel.refresh();
  assetsPanel.refresh();
  projectSettings.refresh();
  varsPanel.refresh();

  // ============================================================
  // Boot
  // ============================================================

  await projectsDB.ready();

  if (hasLegacyProject()) {
    const lastId = await projectsDB.getMeta('lastOpened');
    if (!lastId) {
      const legacyData = readLegacyProject();
      if (legacyData) {
        const newId = makeProjectId();
        const scope = legacyData.assetsScope || makeAssetsScope();

        legacyData.assetsScope = scope;
        importLegacyInto(newId, legacyData);

        await projectsDB.put({
          id:          newId,
          name:        legacyData.name || 'Импортированный проект',
          icon:        isProjectIconDataUrl(legacyData.icon) ? legacyData.icon : null,
          createdAt:   Date.now(),
          updatedAt:   Date.now(),
          canvasWidth: legacyData.canvasWidth  ?? 1024,
          canvasHeight: legacyData.canvasHeight ?? 640,
          bgColor:     legacyData.bgColor ?? '#333333',
          objectCount: (legacyData.scene?.objects || []).length,
          eventCount:  countEventsInSheet(legacyData.sheet),
          assetsScope: scope,
        });
        await projectsDB.setMeta('lastOpened', newId);
        console.log('[project] migrated legacy project →', newId);
      }
    }
    removeLegacyProject();
  }

  ensureEmptyProject();
  syncNoProjectScreen();

  function ensureEmptyProject() {
    scene.fromJSON({
      objects: [],
      layers: [{ id: 'default', name: 'Слой 1', visible: true }],
      nextId: 1,
      nextLayerId: 2,
    });
    project.icon = null;
    project.sheet = defaultEventSheet();
    project.vars = {};
    project.varsInitial = {};
    project.name = 'Pride Engine';
    eventRuntime.setSheet(project.sheet);
    eventSheetPanel.refresh();
    varsPanel.refresh();
    history.init();
  }

  // ---------- Status bar / render loop ----------
  let lastStatus = 0;

  function update(dt) {
    perfOverlay.beginUpdate();
    bridge.flushMappings();
    scene.flush();
    bridge.step(dt);
    if (bridge.running && !bridge.paused) {
      timers.step(dt);
      eventRuntime.tick(dt);
    }
    input.endFrame();
    perfOverlay.endUpdate();
  }

  function render() {
    perfOverlay.beginRender();

    camera.writeMatrix(renderer.uniformData, canvas.width, canvas.height);
    renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, renderer.uniformData);

    const { commandEncoder, renderPass } = renderer.beginFrame();

    const binder = (pageIndex) => {
      const tex = assets.getAtlasTexture(pageIndex);
      if (!tex) return false;
      renderer.setTexture(tex);
      renderPass.setBindGroup(0, renderer.bindGroup);
      return true;
    };

    gridBatch.begin();
    drawGrid(gridBatch, camera, canvas.width, canvas.height, 32);
    gridBatch.flush(renderPass, binder);

    spriteBatch.begin();
    const sorted = scene.getSortedByLayer();
    for (const obj of sorted) {
      const asset = obj.textureId && assets.get(obj.textureId);
      if (!asset) continue;
      if (bridge.running && obj.template) continue;

      spriteBatch.beginGroup(asset.pageIndex);
      const cx = obj.x + obj.width  / 2;
      const cy = obj.y + obj.height / 2;

      const alpha = (!bridge.running && obj.template) ? obj.opacity * 0.4 : obj.opacity;

      spriteBatch.drawRotated(
        cx, cy, obj.width, obj.height, obj.rotation,
        asset.u0, asset.v0, asset.u1, asset.v1,
        1, 1, 1, alpha
      );
    }
    spriteBatch.flush(renderPass, binder);

    overlayBatch.begin();
    drawOverlay(overlayBatch, editor, camera);
    overlayBatch.flush(renderPass, binder);

    physicsBatch.begin();
    if (bridge.running && debugDraw) {
      drawPhysicsDebug(physicsBatch, bridge.world, camera);
      physicsBatch.flush(renderPass, binder);
    }

    renderer.endFrame(commandEncoder, renderPass);

    perfOverlay.set({
      drawCalls:  gridBatch.groups.length
                + spriteBatch.groups.length
                + overlayBatch.groups.length
                + physicsBatch.groups.length,
      vertices:   gridBatch.vertexCount
                + spriteBatch.vertexCount
                + overlayBatch.vertexCount
                + physicsBatch.vertexCount,
      objects:    sorted.length,
      bodies:     bridge.bodiesCount,
      collisions: bridge.world.collisions.length,
    });

    perfOverlay.endRender();
    perfOverlay.tick();

    const now = performance.now();
    if (now - lastStatus > 100) {
      lastStatus = now;
      const w = controller.mouseWorld;
      const state = bridge.running ? (bridge.paused ? 'ПАУЗА' : 'ИГРА') : 'РЕДАКТИРОВАНИЕ';

      const varsPreview = Object.keys(project.vars)
        .slice(0, 4)
        .map((k) => `${k}=${project.vars[k]}`)
        .join(' ');
      const varsStr = varsPreview ? `  |  ${varsPreview}` : '';

      statusEl.textContent =
        `Tool: ${editor.tool}  |  ` +
        `Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})  |  ` +
        `Zoom: ${camera.zoom.toFixed(2)}×  |  ` +
        `Mouse: (${w.x.toFixed(0)}, ${w.y.toFixed(0)})  |  ` +
        `Selected: ${editor.selection.size}/${scene.objects.length}  |  ` +
        `Bodies: ${bridge.bodiesCount}  |  ${state}  |  ` +
        `Undo: ${history.index}/${history.stack.length - 1}` +
        varsStr;

      if (bridge.running && !bridge.paused) {
        varsPanel.updateCurrent();
      }
    }
  }

  const loop = new GameLoop(update, render, (fps) => {
    fpsEl.textContent = `FPS: ${fps}`;
  });
  loop.start();
}

main().catch(console.error);