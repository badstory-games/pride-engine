import { Renderer } from './engine/renderer.js';
import { SpriteBatch } from './engine/sprite-batch.js';
import { GameLoop } from './engine/loop.js';
import { Camera } from './engine/camera.js';
import { AssetManager } from './engine/asset-manager.js';
import { drawGrid } from './engine/grid.js';
import { Scene } from './editor/scene.js';

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

  // --- 1x1 белая текстура (для сетки и примитивов) ---
  {
    const img = new ImageData(1, 1);
    img.data.set([255, 255, 255, 255]);
    const bmp = await createImageBitmap(img);
    assets.loadFromBitmap('__white', bmp);
  }

  // --- Реальный PNG через fetch + createImageBitmap ---
  try {
    const a = await assets.loadPNG('player', './assets/player.png');
    console.log(`[assets] player.png ${a.width}×${a.height} загружен`);
  } catch (err) {
    console.warn('[assets] player.png не загружен, fallback:', err.message);
    // процедурный fallback — чтобы демо всегда работало
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

  // --- Сцена с несколькими объектами ---
  const scene = new Scene();
  scene.add({ x: 200, y: 250, width: 64,  height: 64,  textureId: 'player' });
  scene.add({ x: 320, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 6 });
  scene.add({ x: 440, y: 250, width: 64,  height: 64,  textureId: 'player', rotation: Math.PI / 2, opacity: 0.6 });
  scene.add({ x: 560, y: 250, width: 128, height: 128, textureId: 'player', rotation: -Math.PI / 4 });

  // --- Управление камерой ---
  setupCameraInput(canvas, camera);

  // --- Отслеживание мыши для статус-бара ---
  const mouse = { sx: 0, sy: 0 };
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.sx = (e.clientX - r.left) * (canvas.width  / r.width);
    mouse.sy = (e.clientY - r.top ) * (canvas.height / r.height);
  });

  const batch = new SpriteBatch(renderer.device, renderer.format);

  let lastStatus = 0;

  function update(_dt) {
    // логики пока нет
  }

  function render() {
    // обновляем uniform-матрицу
    camera.writeMatrix(renderer.uniformData, canvas.width, canvas.height);
    renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, renderer.uniformData);

    const { commandEncoder, renderPass } = renderer.beginFrame();

    // --- Сетка (белая текстура) ---
    renderer.setTexture(assets.get('__white').texture);
    renderPass.setBindGroup(0, renderer.bindGroup);
    batch.begin();
    drawGrid(batch, camera, canvas.width, canvas.height, 32);
    batch.end(renderPass);

    // --- Спрайты (player.png) ---
    const playerTex = assets.get('player').texture;
    renderer.setTexture(playerTex);
    renderPass.setBindGroup(0, renderer.bindGroup);
    batch.begin();
    for (const obj of scene.getSortedByLayer()) {
      if (!obj.textureId || !assets.get(obj.textureId)) continue;
      const cx = obj.x + obj.width  / 2;
      const cy = obj.y + obj.height / 2;
      batch.drawRotated(
        cx, cy, obj.width, obj.height, obj.rotation,
        0, 0, 1, 1,
        1, 1, 1, obj.opacity
      );
    }
    batch.end(renderPass);

    renderer.endFrame(commandEncoder, renderPass);

    // --- Статус-бар (10 раз/сек) ---
    const now = performance.now();
    if (now - lastStatus > 100) {
      lastStatus = now;
      const w = camera.screenToWorld(mouse.sx, mouse.sy, canvas.width, canvas.height);
      statusEl.textContent =
        `Camera: (${camera.x.toFixed(0)}, ${camera.y.toFixed(0)})  ` +
        `Zoom: ${camera.zoom.toFixed(2)}×  ` +
        `Mouse: (${w.x.toFixed(0)}, ${w.y.toFixed(0)})  ` +
        `Objects: ${scene.objects.length}`;
    }
  }

  const loop = new GameLoop(update, render, (fps) => {
    fpsEl.textContent = `FPS: ${fps}`;
  });

  loop.start();
}

function setupCameraInput(canvas, camera) {
  let panning = false;
  let panStart = { x: 0, y: 0 };
  let camStart = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    // pan: средняя кнопка ИЛИ Shift + ЛКМ
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      panning = true;
      const r = canvas.getBoundingClientRect();
      panStart.x = e.clientX - r.left;
      panStart.y = e.clientY - r.top;
      camStart.x = camera.x;
      camStart.y = camera.y;
      canvas.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    camera.x = camStart.x - (mx - panStart.x) / camera.zoom;
    camera.y = camStart.y - (my - panStart.y) / camera.zoom;
  });

  window.addEventListener('mouseup', () => {
    if (panning) {
      panning = false;
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (canvas.width  / r.width);
    const sy = (e.clientY - r.top ) * (canvas.height / r.height);
    camera.zoomAt(sx, sy, e.deltaY, canvas.width, canvas.height);
  }, { passive: false });

  // блокируем автопрокрутку на средней кнопке
  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
}

main().catch(console.error);