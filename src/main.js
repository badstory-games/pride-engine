import { Renderer } from './engine/renderer.js';
import { SpriteBatch } from './engine/sprite-batch.js';
import { GameLoop } from './engine/loop.js';
import { Camera } from './engine/camera.js';
import { AssetManager } from './engine/asset-manager.js';
import { drawGrid } from './engine/grid.js';
import { Scene } from './editor/scene.js';
import { Editor } from './editor/editor.js';
import { EditorController } from './editor/input.js';
import { drawOverlay } from './editor/overlay.js';
import { ShortcutsModal } from './editor/shortcuts-modal.js';
import { Inspector } from './editor/inspector.js';
import { LayersPanel } from './editor/layers-panel.js';
import { saveProject, loadProject, clearProject, hasProject } from './project/storage.js';

async function main() {
  const canvas = document.getElementById('pride-canvas');
  const fpsEl = document.getElementById('fps');
  const statusEl = document.getElementById('status');

  const renderer = new Renderer();
  await renderer.init(canvas);

  const camera = new Camera();
  camera.x = canvas.width / 2;
  camera.y = canvas.height / 2;
  camera.zoom = 1;

  const assets = new AssetManager(renderer.device);

  // --- 1×1 белая текстура ---
  {
    const img = new ImageData(1, 1);
    img.data.set([255, 255, 255, 255]);
    const bmp = await createImageBitmap(img);
    assets.loadFromBitmap('__white', bmp);
  }

  // --- player.png ---
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

  // --- Сцена + Editor ---
  const scene = new Scene();
  const editor = new Editor(scene);
  const controller = new EditorController(canvas, camera, editor);

  // --- Inspector ---
  const inspector = new Inspector(
    document.getElementById('inspector-content'),
    editor,
    scene
  );
  inspector.setTextures(['player', '__white']);

  // --- Layers panel ---
  const layersPanel = new LayersPanel(
    document.getElementById('layers-panel'),
    editor,
    scene
  );

  // --- Shortcuts modal ---
  const shortcutsModal = new ShortcutsModal();
  document.getElementById('btn-shortcuts')
    .addEventListener('click', () => shortcutsModal.toggle());
  controller.onToggleShortcuts = () => shortcutsModal.toggle();
  controller.isShortcutsOpen  = () => shortcutsModal.isOpen;

  // --- Toolbar buttons ---
  const toolButtons = document.querySelectorAll('.tool');
  function refreshToolButtons() {
    toolButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === editor.tool);
    });
  }
  toolButtons.forEach((b) => {
    b.addEventListener('click', () => controller.setTool(b.dataset.tool));
  });
  refreshToolButtons();

  // --- Save indicator + debounced autosave ---
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
      if (saveProject(scene)) {
        setIndicator('saved', '✓ saved ' + new Date().toLocaleTimeString());
      } else {
        setIndicator('error', '✕ save error');
      }
    }, 500);
  }

  // --- Первая загрузка: восстановить или создать демо ---
  if (hasProject()) {
    if (loadProject(scene)) {
      setIndicator('saved', '✓ loaded');
      console.log('[storage] project restored from localStorage');
    }
  } else {
    scene.add({ x: 200, y: 250, width: 64,  height: 64,  textureId: 'player' });
    scene.add({ x: 320, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 6 });
    scene.add({ x: 440, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 2, opacity: 0.6 });
    scene.add({ x: 560, y: 250, width: 128, height: 128, textureId: 'player', rotation: -Math.PI / 4 });
    scene.addLayer('Background');
    scene.moveLayer(scene.layers[scene.layers.length - 1].id, -1);
    setIndicator('saved', '✓ ready');
  }

  // --- Topbar: Save / Load / New ---
  document.getElementById('btn-save').addEventListener('click', () => {
    if (saveProject(scene)) {
      setIndicator('saved', '✓ saved ' + new Date().toLocaleTimeString());
    } else {
      setIndicator('error', '✕ save error');
    }
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    if (!hasProject()) { alert('Нет сохранённого проекта'); return; }
    if (loadProject(scene)) {
      editor.clearSelection();
      setIndicator('saved', '✓ loaded');
      editor.onChange();
    } else {
      setIndicator('error', '✕ load error');
    }
  });

  document.getElementById('btn-new').addEventListener('click', () => {
    if (!confirm('Создать новый проект? Несохранённое будет потеряно.')) return;
    clearProject();
    scene.objects = [];
    scene.layers = [{ id: 'default', name: 'Layer 1', visible: true }];
    scene.nextId = 1;
    scene.nextLayerId = 1;
    editor.clearSelection();
    setIndicator('dirty', '● new');
    editor.onChange();
  });

  // --- onChange: единая точка обновления UI ---
  editor.onChange = () => {
    refreshToolButtons();
    inspector.refresh();
    layersPanel.refresh();
    scheduleSave();
  };

  // Начальный refresh
  inspector.refresh();
  layersPanel.refresh();

  // --- Батчи: grid / sprites / overlay. Один на категорию. ---
  // Внутри спрайтов группы по текстурам — через sub-arena в одном буфере.
  const gridBatch    = new SpriteBatch(renderer.device, renderer.format);
  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const overlayBatch = new SpriteBatch(renderer.device, renderer.format);

  const spriteBatches = new Map();  // textureId → SpriteBatch
  function getSpriteBatch(texId) {
    let b = spriteBatches.get(texId);
    if (!b) {
      b = new SpriteBatch(renderer.device, renderer.format);
      spriteBatches.set(texId, b);
    }
    return b;
  }

  let lastStatus = 0;

  function update(_dt) {}

  function render() {
    camera.writeMatrix(renderer.uniformData, canvas.width, canvas.height);
    renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, renderer.uniformData);

    const { commandEncoder, renderPass } = renderer.beginFrame();

    // --- 1) Сетка ---
    renderer.setTexture(assets.get('__white').texture);
    renderPass.setBindGroup(0, renderer.bindGroup);
    gridBatch.begin();
    drawGrid(gridBatch, camera, canvas.width, canvas.height, 32);
    gridBatch.flush(renderPass);   // одна текстура, binder не нужен

    // --- 2) Спрайты: группы по textureId в одном буфере ---
    spriteBatch.begin();
    for (const obj of scene.getSortedByLayer()) {
      const asset = obj.textureId && assets.get(obj.textureId);
      if (!asset) continue;

      spriteBatch.beginGroup(obj.textureId);   // склеит подряд идущие с той же текстурой
      const cx = obj.x + obj.width  / 2;
      const cy = obj.y + obj.height / 2;
      spriteBatch.drawRotated(
        cx, cy, obj.width, obj.height, obj.rotation,
        0, 0, 1, 1,
        1, 1, 1, obj.opacity
      );
    }
    spriteBatch.flush(renderPass, (texId) => {
      const a = texId && assets.get(texId);
      if (!a) return;
      renderer.setTexture(a.texture);
      renderPass.setBindGroup(0, renderer.bindGroup);
    });

    // --- 3) Оверлей ---
    renderer.setTexture(assets.get('__white').texture);
    renderPass.setBindGroup(0, renderer.bindGroup);
    overlayBatch.begin();
    drawOverlay(overlayBatch, editor, camera);
    overlayBatch.flush(renderPass);

    renderer.endFrame(commandEncoder, renderPass);

    // --- Статус-бар ---
    const now = performance.now();
    if (now - lastStatus > 100) {
      lastStatus = now;
      const w = controller.mouseWorld;
      statusEl.textContent =
        `Tool: ${editor.tool}  |  ` +
        `Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})  |  ` +
        `Zoom: ${camera.zoom.toFixed(2)}×  |  ` +
        `Mouse: (${w.x.toFixed(0)}, ${w.y.toFixed(0)})  |  ` +
        `Selected: ${editor.selection.size} / ${scene.objects.length}`;
    }
  }

  const loop = new GameLoop(update, render, (fps) => {
    fpsEl.textContent = `FPS: ${fps}`;
  });
  loop.start();
}

main().catch(console.error);