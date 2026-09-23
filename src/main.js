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

  // --- Сцена ---
  const scene = new Scene();
  scene.add({ x: 200, y: 250, width: 64,  height: 64,  textureId: 'player' });
  scene.add({ x: 320, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 6 });
  scene.add({ x: 440, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 2, opacity: 0.6 });
  scene.add({ x: 560, y: 250, width: 128, height: 128, textureId: 'player', rotation: -Math.PI / 4 });

  // --- Editor + Controller ---
  const editor = new Editor(scene);
  const controller = new EditorController(canvas, camera, editor);

  // --- Shortcuts modal ---
  const shortcutsModal = new ShortcutsModal();
  document.getElementById('btn-shortcuts')
    .addEventListener('click', () => shortcutsModal.toggle());

  controller.onToggleShortcuts = () => shortcutsModal.toggle();
  controller.isShortcutsOpen  = () => shortcutsModal.isOpen;

  // --- Toolbar ---
  const toolButtons = document.querySelectorAll('.tool');
  function refreshToolButtons() {
    toolButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === editor.tool);
    });
  }
  toolButtons.forEach((b) => {
    b.addEventListener('click', () => {
      controller.setTool(b.dataset.tool);
      refreshToolButtons();
    });
  });
  refreshToolButtons();

  editor.onChange = () => {
    refreshToolButtons();
    // зарезервировано под undo/redo и автосохранение
  };

  const gridBatch    = new SpriteBatch(renderer.device, renderer.format);
  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const overlayBatch = new SpriteBatch(renderer.device, renderer.format);

  let lastStatus = 0;

  function update(_dt) {}

  function render() {
    camera.writeMatrix(renderer.uniformData, canvas.width, canvas.height);
  renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, renderer.uniformData);

  const { commandEncoder, renderPass } = renderer.beginFrame();

  // --- 1) Сетка (белая текстура) ---
  renderer.setTexture(assets.get('__white').texture);
  renderPass.setBindGroup(0, renderer.bindGroup);
  gridBatch.begin();
  drawGrid(gridBatch, camera, canvas.width, canvas.height, 32);
  gridBatch.end(renderPass);

  // --- 2) Спрайты (player.png) ---
  renderer.setTexture(assets.get('player').texture);
  renderPass.setBindGroup(0, renderer.bindGroup);
  spriteBatch.begin();
  for (const obj of scene.getSortedByLayer()) {
    const a = obj.textureId && assets.get(obj.textureId);
    if (!a) continue;
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    spriteBatch.drawRotated(
      cx, cy, obj.width, obj.height, obj.rotation,
      0, 0, 1, 1,
      1, 1, 1, obj.opacity
    );
  }
  spriteBatch.end(renderPass);

  // --- 3) Оверлей (белая текстура) ---
  renderer.setTexture(assets.get('__white').texture);
  renderPass.setBindGroup(0, renderer.bindGroup);
  overlayBatch.begin();
  drawOverlay(overlayBatch, editor, camera);
  overlayBatch.end(renderPass);

  renderer.endFrame(commandEncoder, renderPass)

    // Статус-бар, 10 раз в секунду
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