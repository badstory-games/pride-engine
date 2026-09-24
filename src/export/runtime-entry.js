import { Renderer }       from '../engine/renderer.js';
import { SpriteBatch }    from '../engine/sprite-batch.js';
import { GameLoop }       from '../engine/loop.js';
import { Camera }         from '../engine/camera.js';
import { AssetManager }   from '../engine/asset-manager.js';
import { InputState }     from '../engine/input-state.js';
import { PhysicsBridge }  from '../engine/physics-bridge.js';
import { drawPhysicsDebug } from '../engine/physics/debug-draw.js';

import { registry }            from '../engine/events/registry.js';
import { registerConditions }  from '../engine/events/conditions.js';
import { registerActions }     from '../engine/events/actions.js';
import { EventRuntime }        from '../engine/events/runtime.js';

import { Scene } from '../editor/scene.js';

/**
 * Ожидает на странице:
 *   <canvas id="pride-canvas" width=… height=…>
 *   <div id="fps">
 * и глобалы:
 *   window.__PRIDE_PROJECT__ = { scene, sheet, varsInitial }
 *   window.__PRIDE_ASSETS__  = { id: dataUrl, … }
 */
export async function startGame(projectData, assetsData, opts = {}) {
  registerConditions();
  registerActions();

  const canvas = document.getElementById('pride-canvas');
  const fpsEl  = document.getElementById('fps');

  const renderer = new Renderer();
  await renderer.init(canvas);

  const scene = new Scene();
  scene.fromJSON(projectData.scene);

  const camera = new Camera();
  camera.x = canvas.width  / 2;
  camera.y = canvas.height / 2;

  const assets = new AssetManager(renderer.device);

  // 1×1 белая — всегда, для grid/debug/rect-объектов
  {
    const img = new ImageData(1, 1);
    img.data.set([255, 255, 255, 255]);
    const bmp = await createImageBitmap(img);
    assets.loadFromBitmap('__white', bmp);
  }

  // Встроенные ассеты + диагностика
  const loadedIds = new Set();

  for (const [id, dataUrl] of Object.entries(assetsData || {})) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bmp  = await createImageBitmap(blob);
      assets.loadFromBitmap(id, bmp);
      loadedIds.add(id);
    } catch (e) {
      console.warn(`[export] asset "${id}" failed:`, e);
    }
  }

  // Какие textureId нужны сцене, но не пришли в assetsData?
  const needed = new Set();
  for (const obj of scene.objects) {
    if (obj.textureId) needed.add(obj.textureId);
  }
  const missing = [...needed].filter(
    (id) => id !== '__white' && !loadedIds.has(id)
  );
  if (missing.length) {
    console.warn(
      `[export] отсутствуют текстуры: ${missing.join(', ')}. ` +
      `Объекты с ними рендериться не будут.`
    );
  }

  const bridge = new PhysicsBridge(scene);
  const input  = new InputState();
  const vars   = { ...(projectData.varsInitial || {}) };

  const runtime = new EventRuntime(projectData.sheet, (dt) => ({
    world: bridge.world,
    scene,
    input,
    vars,
    dt,
    time: performance.now() / 1000,
  }));

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
    input.press(e.code);
  });
  window.addEventListener('keyup', (e) => input.release(e.code));

  bridge.start();

  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const physicsBatch = new SpriteBatch(renderer.device, renderer.format);

  function update(dt) {
    bridge.step(dt);
    if (bridge.running && !bridge.paused) runtime.tick(dt);
    input.endFrame();
  }

  function render() {
    camera.writeMatrix(renderer.uniformData, canvas.width, canvas.height);
    renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, renderer.uniformData);

    const { commandEncoder, renderPass } = renderer.beginFrame();

    // Sprites
    spriteBatch.begin();
    for (const obj of scene.getSortedByLayer()) {
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

    // Опциональный debug draw
    if (opts.debugDraw) {
      renderer.setTexture(assets.get('__white').texture);
      renderPass.setBindGroup(0, renderer.bindGroup);
      physicsBatch.begin();
      drawPhysicsDebug(physicsBatch, bridge.world, camera);
      physicsBatch.flush(renderPass);
    }

    renderer.endFrame(commandEncoder, renderPass);
  }

  const loop = new GameLoop(update, render, (fps) => {
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
  });
  loop.start();

  return { renderer, scene, camera, bridge, runtime, loop };
}