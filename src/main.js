import { Renderer } from './engine/renderer.js';
import { SpriteBatch } from './engine/sprite-batch.js';
import { GameLoop } from './engine/loop.js';
import { Camera } from './engine/camera.js';
import { AssetManager } from './engine/asset-manager.js';
import { drawGrid } from './engine/grid.js';
import { InputState } from './engine/input-state.js';
import { PhysicsBridge } from './engine/physics-bridge.js';
import { drawPhysicsDebug } from './engine/physics/debug-draw.js';

import { registry } from './engine/events/registry.js';
import { registerConditions } from './engine/events/conditions.js';
import { registerActions }    from './engine/events/actions.js';
import { EventRuntime }       from './engine/events/runtime.js';
import { defaultEventSheet }  from './engine/events/demo.js';

import { Scene } from './editor/scene.js';
import { Editor } from './editor/editor.js';
import { EditorController } from './editor/input.js';
import { drawOverlay } from './editor/overlay.js';
import { ShortcutsModal } from './editor/shortcuts-modal.js';
import { Inspector } from './editor/inspector.js';
import { LayersPanel } from './editor/layers-panel.js';
import { Tabs } from './editor/tabs.js';
import { EventSheetPanel } from './editor/event-sheet-panel.js';
import { EventPalette }     from './editor/event-palette.js';
import { VarsPanel } from './editor/vars-panel.js';
import { History } from './editor/history.js';
import { Clipboard } from './editor/clipboard.js';
import { PerfOverlay } from './editor/perf-overlay.js';
import { runBenchmark, formatResults } from './editor/benchmark.js';

import { saveProject, loadProject, clearProject, hasProject } from './project/storage.js';
import { serializeProject, deserializeProject } from './project/serializer.js';
import { downloadBytes, downloadText, pickFile, readFileBytes } from './project/file-io.js';
import { exportWebGame } from './export/exporter.js';
import { Modal } from './editor/modal.js';
import { initIcons } from './editor/icons.js';

async function main() {
  initIcons();

  registerConditions();
  registerActions();

  const canvas   = document.getElementById('pride-canvas');
  const fpsEl    = document.getElementById('fps');
  const statusEl = document.getElementById('status-info');

  const renderer = new Renderer();
  await renderer.init(canvas);

  const camera = new Camera();
  camera.x = canvas.width / 2;
  camera.y = canvas.height / 2;
  camera.zoom = 1;

  const assets = new AssetManager(renderer.device);

  // 1×1 белая
  {
    const img = new ImageData(1, 1);
    img.data.set([255, 255, 255, 255]);
    const bmp = await createImageBitmap(img);
    assets.loadFromBitmap('__white', bmp);
  }

  // player.png
  try {
    const a = await assets.loadPNG('player', './assets/player.png');
    console.log(`[assets] player.png ${a.width}×${a.height}`);
  } catch (err) {
    console.warn('[assets] fallback:', err.message);
    const size = 64;
    const img = new ImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const check = ((x >> 3) + (y >> 3)) % 2 === 0;
        img.data[i]     = check ? 255 : 100;
        img.data[i + 1] = check ? 100 : 255;
        img.data[i + 2] = check ? 100 : 100;
        img.data[i + 3] = 255;
      }
    }
    const bmp = await createImageBitmap(img);
    assets.loadFromBitmap('player', bmp);
  }

  // --- Сцена / проект / редактор ---
  const scene   = new Scene();
  const project = { scene, sheet: null, vars: {}, varsInitial: {} };
  const editor  = new Editor(scene);
  const controller = new EditorController(canvas, camera, editor);
  const bridge  = new PhysicsBridge(scene);
  const clipboard = new Clipboard();

  const perfOverlay = new PerfOverlay(document.getElementById('canvas-wrap'));

  // --- Input ---
  const input = new InputState();

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
    input.press(e.code);
  });

  window.addEventListener('keyup', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    input.release(e.code);
  });

  // --- Event runtime ---
  const eventRuntime = new EventRuntime(project.sheet || defaultEventSheet(), (dt) => ({
    world: bridge.world,
    scene,
    input,
    vars:  project.vars,
    dt,
    time:  performance.now() / 1000,
  }));

  // --- Inspector / Layers ---
  const inspector = new Inspector(
    document.getElementById('inspector-content'), editor, scene);
  inspector.setTextures(['player', '__white']);

  const layersPanel = new LayersPanel(
    document.getElementById('layers-panel'), editor, scene);

  // --- Shortcuts modal ---
  const shortcutsModal = new ShortcutsModal();
  document.getElementById('btn-shortcuts')
    .addEventListener('click', () => shortcutsModal.toggle());
  controller.onToggleShortcuts = () => shortcutsModal.toggle();
  controller.isShortcutsOpen  = () => shortcutsModal.isOpen;

  // --- Toolbar ---
  const toolButtons = document.querySelectorAll('.tool');
  function refreshToolButtons() {
    toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === editor.tool));
  }
  toolButtons.forEach((b) => {
    b.addEventListener('click', () => controller.setTool(b.dataset.tool));
  });
  refreshToolButtons();

  // --- Save indicator + autosave ---
  const saveIndicator = document.getElementById('save-indicator');
  let saveTimer = 0;

  function setIndicator(cls, text) {
    saveIndicator.className = 'save-indicator ' + cls;
    saveIndicator.textContent = text;
  }

  function scheduleSave() {
    setIndicator('dirty', '● unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (saveProject(project)) {
        setIndicator('saved', '✓ saved ' + new Date().toLocaleTimeString());
      } else {
        setIndicator('error', '✕ save error');
      }
    }, 500);
  }

  // --- Первая загрузка ---
  if (hasProject()) {
    if (loadProject(project)) {
      setIndicator('saved', '✓ loaded');
      console.log('[storage] project restored');
    }
  } else {
    scene.add({
      x: 200, y: 250, width: 64, height: 64, textureId: 'player', name: 'Player',
      physics: { enabled: true, type: 'dynamic', shape: 'box',
                 density: 1, friction: 0.5, restitution: 0.2, radius: 32 },
    });
    scene.add({
      x: 320, y: 250, width: 64, height: 64, textureId: 'player', name: 'Crate',
      physics: { enabled: true, type: 'dynamic', shape: 'box',
                 density: 1, friction: 0.5, restitution: 0.2, radius: 32 },
    });
    scene.add({
      x: 440, y: 250, width: 128, height: 24, textureId: '__white', name: 'Ground',
      physics: { enabled: true, type: 'static', shape: 'box',
                 density: 1, friction: 0.7, restitution: 0.05, radius: 32 },
    });
    scene.addLayer('Background');
    scene.moveLayer(scene.layers[scene.layers.length - 1].id, -1);
    setIndicator('saved', '✓ ready');
  }

  // --- Event sheet ---
  if (!project.sheet)       project.sheet       = defaultEventSheet();
  if (!project.vars)        project.vars        = {};
  if (!project.varsInitial) project.varsInitial = { ...project.vars };
  eventRuntime.setSheet(project.sheet);

  const eventSheetPanel = new EventSheetPanel(
    document.getElementById('event-sheet-main'),
    project, eventRuntime, scene
  );
  eventSheetPanel.onChange = () => scheduleSave();
  eventSheetPanel.refresh();

  const eventPalette = new EventPalette(
    document.getElementById('event-palette'),
    async (kind, type) => {
      const sheet = project.sheet;
      if (!sheet) return;
      const first = sheet.events[0];
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
        const params = {};
        for (const p of (def.params || [])) params[p.id] = p.default;
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
  varsPanel.onChange = () => scheduleSave();
  varsPanel.refresh();

  // ============================================================
  // Undo / Redo
  // ============================================================

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  const history = new History({
    snapshotFn: () => structuredClone({
      scene: scene.toJSON(),
      sheet: project.sheet,
      varsInitial: project.varsInitial,
      selection: [...editor.selection],
    }),
    restoreFn: (state) => {
      const s = structuredClone(state);

      scene.fromJSON(s.scene);
      project.sheet       = s.sheet;
      project.varsInitial = s.varsInitial;

      editor.selection.clear();
      for (const id of s.selection) editor.selection.add(id);

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      inspector.refresh();
      layersPanel.refresh();
      scheduleSave();
    },
    limit: 100,
    isLocked: () => editor.locked,
  });

  editor.history          = history;
  varsPanel.history       = history;
  eventSheetPanel.history = history;

  function refreshUndoButtons() {
    if (!btnUndo || !btnRedo) return;
    btnUndo.disabled = !history.canUndo() || editor.locked;
    btnRedo.disabled = !history.canRedo() || editor.locked;
  }

  history.onChange = () => refreshUndoButtons();

  btnUndo.addEventListener('click', () => history.undo());
  btnRedo.addEventListener('click', () => history.redo());

  history.init();

  // --- View tabs ---
  const eventSheetView = document.getElementById('event-sheet-view');
  const tabs = new Tabs(document.getElementById('view-tabs'), (id) => {
    const isLayout = id === 'layout';
    canvas.hidden = !isLayout;
    eventSheetView.hidden = isLayout;
    if (!isLayout) eventSheetPanel.refresh();
  });

  // --- Topbar: Save / Load / New ---
  document.getElementById('btn-save').addEventListener('click', () => {
    if (saveProject(project)) {
      setIndicator('saved', '✓ saved ' + new Date().toLocaleTimeString());
    } else {
      setIndicator('error', '✕ save error');
    }
  });

  document.getElementById('btn-load').addEventListener('click', async () => {
    if (!hasProject()) {
      await Modal.alert({
        title: 'Нет сохранённого проекта',
        message: 'В этом браузере ещё не сохранялся проект. Нажмите «Сохранить», чтобы создать точку сохранения.',
        okText: 'Понятно',
      });
      return;
    }
    if (loadProject(project)) {
      editor.clearSelection();
      if (!project.sheet) project.sheet = defaultEventSheet();
      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      setIndicator('saved', '✓ loaded');
      editor.onChange();
      history.init();
    } else {
      setIndicator('error', '✕ load error');
    }
  });

  document.getElementById('btn-new').addEventListener('click', async () => {
    const ok = await Modal.confirm({
      title: 'Создать новый проект',
      message: 'Текущая сцена, лист событий и переменные будут сброшены. Несохранённые изменения будут потеряны.',
      okText: 'Создать',
      cancelText: 'Отмена',
      danger: true,
    });
    if (!ok) return;

    clearProject();
    scene.objects = [];
    scene.layers = [{ id: 'default', name: 'Слой 1', visible: true }];
    scene.nextId = 1;
    scene.nextLayerId = 1;
    scene._layerIdxDirty = true;
    project.sheet = defaultEventSheet();
    project.vars = {};
    project.varsInitial = {};
    eventRuntime.setSheet(project.sheet);
    eventSheetPanel.refresh();
    varsPanel.refresh();
    editor.clearSelection();
    setIndicator('dirty', '● new');
    editor.onChange();
    history.init();
  });

  // --- File I/O: .pride + export ---

  async function doSavePride() {
    try {
      const bytes = await serializeProject(project);
      downloadBytes(bytes, 'project.pride', 'application/octet-stream');
      setIndicator('saved', '✓ .pride');
    } catch (e) {
      console.error('[save .pride]', e);
      setIndicator('error', '✕ save error');
    }
  }

  async function doOpenPride() {
    try {
      const file = await pickFile('.pride,application/octet-stream');
      if (!file) return;

      const bytes  = await readFileBytes(file);
      const loaded = await deserializeProject(bytes, scene);

      project.sheet       = loaded.sheet || defaultEventSheet();
      project.vars        = loaded.vars;
      project.varsInitial = loaded.varsInitial;

      eventRuntime.setSheet(project.sheet);
      eventSheetPanel.refresh();
      varsPanel.refresh();
      editor.clearSelection();
      editor.onChange();
      setIndicator('saved', '✓ .pride loaded');
      history.init();
    } catch (e) {
      console.error('[open .pride]', e);
      setIndicator('error', '✕ load error');
      await Modal.alert({
        title: 'Не удалось открыть файл',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    }
  }

  async function doExportGame() {
    setIndicator('dirty', '● exporting…');
    try {
      const html = await exportWebGame(project, {
        title: 'Pride Game',
        debugDraw: false,
        assetManager: assets,
      });
      downloadText(html, 'game.html', 'text/html;charset=utf-8');
      setIndicator('saved', '✓ exported');
    } catch (e) {
      console.error('[export]', e);
      setIndicator('error', '✕ export error');
      await Modal.alert({
        title: 'Экспорт не удался',
        message: e.message || 'Неизвестная ошибка.',
        okText: 'Закрыть',
      });
    }
  }

  document.getElementById('btn-save-pride').addEventListener('click', doSavePride);
  document.getElementById('btn-open-pride').addEventListener('click', doOpenPride);
  document.getElementById('btn-export')    .addEventListener('click', doExportGame);

  // ============================================================
  // Benchmark (F9)
  // ============================================================

  async function doBenchmark() {
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
    try {
      const results = await runBenchmark({
        scene, bridge, perfOverlay,
        setDebugDraw: (v) => {
          console.log('[bench] setDebugDraw', v);   // ← добавить
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
    }
  }

  // --- Play / Pause / Stop / Debug ---
  const btnPlay  = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnStop  = document.getElementById('btn-stop');
  const btnDebug = document.getElementById('btn-debug');

  let debugDraw = true;

  function refreshPlayButtons() {
    btnPlay.classList.toggle('active', bridge.running && !bridge.paused);
    btnPause.classList.toggle('active', bridge.running && bridge.paused);
    btnStop.classList.toggle('danger', !bridge.running);
    btnStop.disabled  = !bridge.running;
    btnPause.disabled = !bridge.running;
    btnDebug.classList.toggle('toggled', debugDraw);
    refreshUndoButtons();
  }

  function doPlay() {
    if (!bridge.running) {
      for (const k of Object.keys(project.vars)) delete project.vars[k];
      Object.assign(project.vars, project.varsInitial);

      bridge.start();
      editor.locked = true;
      editor.clearSelection();
      input.clear();
      eventRuntime.reset();

      varsPanel.setRunning(true);
      varsPanel.refresh();
      console.log('[play] bodies:', bridge.bodiesCount);
    } else if (bridge.paused) {
      bridge.resume();
    }
    refreshPlayButtons();
  }

  function doPause() {
    if (bridge.running && !bridge.paused) bridge.pause();
    refreshPlayButtons();
  }

  function doStop() {
    if (bridge.running) bridge.stop();

    for (const k of Object.keys(project.vars)) delete project.vars[k];
    Object.assign(project.vars, project.varsInitial);

    editor.locked = false;
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

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (e.code === 'F8') { e.preventDefault(); perfOverlay.toggle(); return; }
    if (e.code === 'F9') { e.preventDefault(); doBenchmark();      return; }

    const tag = document.activeElement && document.activeElement.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA';

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
      if (e.code === 'KeyC') {
        e.preventDefault();
        clipboard.copy(editor, scene);
        return;
      }
      if (e.code === 'KeyX') {
        e.preventDefault();
        clipboard.cut(editor, scene);
        return;
      }
      if (e.code === 'KeyV') {
        e.preventDefault();
        clipboard.paste(editor, scene);
        return;
      }
      if (e.code === 'KeyD') {
        e.preventDefault();
        clipboard.duplicate(editor, scene);
        return;
      }
    }

    if (mod && e.code === 'KeyS') { e.preventDefault(); doSavePride();  return; }
    if (mod && e.code === 'KeyO') { e.preventDefault(); doOpenPride();  return; }
    if (mod && e.code === 'KeyE') { e.preventDefault(); doExportGame(); return; }

    if (e.code === 'F5')      { e.preventDefault(); doPlay();  }
    else if (e.code === 'F6') { e.preventDefault(); doPause(); }
    else if (e.code === 'F7') { e.preventDefault(); doStop();  }
  });

  refreshPlayButtons();
  refreshUndoButtons();

  editor.onChange = () => {
    refreshToolButtons();
    inspector.refresh();
    layersPanel.refresh();
    varsPanel.refresh();
    scheduleSave();
  };

  inspector.refresh();
  layersPanel.refresh();

  const gridBatch    = new SpriteBatch(renderer.device, renderer.format);
  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const overlayBatch = new SpriteBatch(renderer.device, renderer.format);
  const physicsBatch = new SpriteBatch(renderer.device, renderer.format);

  let lastStatus = 0;

  function update(dt) {
    perfOverlay.beginUpdate();
    bridge.step(dt);
    if (bridge.running && !bridge.paused) {
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

    renderer.setTexture(assets.get('__white').texture);
    renderPass.setBindGroup(0, renderer.bindGroup);
    gridBatch.begin();
    drawGrid(gridBatch, camera, canvas.width, canvas.height, 32);
    gridBatch.flush(renderPass);

    spriteBatch.begin();
    const sorted = scene.getSortedByLayer();
    for (const obj of sorted) {
      const asset = obj.textureId && assets.get(obj.textureId);
      if (!asset) continue;
      spriteBatch.beginGroup(obj.textureId);
      const cx = obj.x + obj.width  / 2;
      const cy = obj.y + obj.height / 2;
      spriteBatch.drawRotated(cx, cy, obj.width, obj.height, obj.rotation,
        0, 0, 1, 1, 1, 1, 1, obj.opacity);
    }
    spriteBatch.flush(renderPass, (texId) => {
      const a = texId && assets.get(texId);
      if (!a) return;
      renderer.setTexture(a.texture);
      renderPass.setBindGroup(0, renderer.bindGroup);
    });

    renderer.setTexture(assets.get('__white').texture);
    renderPass.setBindGroup(0, renderer.bindGroup);
    overlayBatch.begin();
    drawOverlay(overlayBatch, editor, camera);
    overlayBatch.flush(renderPass);

    physicsBatch.begin();

    if (bridge.running && debugDraw) {
      renderer.setTexture(assets.get('__white').texture);
      renderPass.setBindGroup(0, renderer.bindGroup);
      drawPhysicsDebug(physicsBatch, bridge.world, camera);
      physicsBatch.flush(renderPass);
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