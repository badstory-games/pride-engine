import { Renderer }       from '../engine/renderer.js';
import { SpriteBatch }    from '../engine/sprite-batch.js';
import { GameLoop }       from '../engine/loop.js';
import { Camera }         from '../engine/camera.js';
import { AssetManager }   from '../engine/asset-manager.js';
import { AudioManager }   from '../engine/audio-manager.js';
import { InputState }     from '../engine/input-state.js';
import { PhysicsBridge }  from '../engine/physics-bridge.js';
import { drawPhysicsDebug } from '../engine/physics/debug-draw.js';

import { registry }            from '../engine/events/registry.js';
import { registerConditions }  from '../engine/events/conditions.js';
import { registerActions }     from '../engine/events/actions.js';
import { EventRuntime }        from '../engine/events/runtime.js';
import { TimerStore }          from '../engine/events/timers.js';

import { Scene } from '../editor/scene.js';

function hideSplash() {
  const el = document.getElementById('pride-splash');
  if (!el) return;
  el.classList.add('hidden');
  setTimeout(() => el.remove(), 500);
}

export async function startGame(projectData, imagesData, soundsData, opts = {}) {
  const showSplash = opts.showSplash !== false;
  const splashStart = performance.now();

  registerConditions();
  registerActions();

  const canvas = document.getElementById('pride-canvas');
  const fpsEl  = document.getElementById('fps');

  const renderer = new Renderer();
  await renderer.init(canvas);

  const bg = hexToRgb01(projectData.bgColor || '#333333');
  renderer.setClearColor(bg.r, bg.g, bg.b, 1.0);

  const scene = new Scene();
  scene.fromJSON(projectData.scene);

  const camera = new Camera();
  camera.x = canvas.width  / 2;
  camera.y = canvas.height / 2;

  const assets = new AssetManager(renderer.device);
  await assets.useScope('__export__');

  // Текстуры
  for (const [id, dataUrl] of Object.entries(imagesData || {})) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bmp  = await createImageBitmap(blob);
      assets.loadFromBitmap(id, bmp);
    } catch (e) {
      console.warn(`[export] image "${id}" failed:`, e);
    }
  }

  // Звуки. Декодируем до старта игры — чтобы первый PlaySound не пропал.
  const audio = new AudioManager();
  for (const [id, dataUrl] of Object.entries(soundsData || {})) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bytes = await blob.arrayBuffer();
      await audio.decode(id, bytes);
    } catch (e) {
      console.warn(`[export] sound "${id}" failed:`, e);
    }
  }

  const needed = new Set();
  for (const obj of scene.objects) {
    if (obj.textureId) needed.add(obj.textureId);
  }
  const missing = [...needed].filter(
    (id) => id !== '__white' && !assets.has(id)
  );
  if (missing.length) {
    console.warn(
      `[export] отсутствуют текстуры: ${missing.join(', ')}. ` +
      `Объекты с ними рендериться не будут.`
    );
  }

  const bridge = new PhysicsBridge(scene, {
    gravityX: projectData.gravityX ?? 0,
    gravityY: projectData.gravityY ?? 980,
  });
  const input  = new InputState();
  const vars   = { ...(projectData.varsInitial || {}) };
  const timers = new TimerStore();

  const runtime = new EventRuntime(projectData.sheet, (dt) => ({
    world: bridge.world,
    scene,
    input,
    vars,
    timers,
    audio,
    endedSounds: audio.drainEnded(),
    dt,
    time: performance.now() / 1000,
    spawnBodyFor:   (obj) => bridge.spawnBodyFor(obj),
    destroyBodyFor: (id)  => bridge.destroyBodyFor(id),
  }));

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
    input.press(e.code);
  });
  window.addEventListener('keyup', (e) => input.release(e.code));

  // Разбудить AudioContext на первый жест пользователя.
  const wake = () => audio.resume();
  window.addEventListener('pointerdown', wake, { capture: true });
  window.addEventListener('keydown',      wake, { capture: true });

  bridge.start();

  const spriteBatch  = new SpriteBatch(renderer.device, renderer.format);
  const physicsBatch = new SpriteBatch(renderer.device, renderer.format);

  const white = assets.get('__white');
  if (white) {
    spriteBatch.setWhiteUV(white);
    physicsBatch.setWhiteUV(white);
  }

  function update(dt) {
    bridge.flushMappings();
    scene.flush();

    bridge.step(dt);
    if (bridge.running && !bridge.paused) {
      timers.step(dt);
      runtime.tick(dt);
    }
    input.endFrame();
  }

  function render() {
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

    spriteBatch.begin();
    for (const obj of scene.getSortedByLayer()) {
      if (obj.template) continue;
      const asset = obj.textureId && assets.get(obj.textureId);
      if (!asset) continue;
      spriteBatch.beginGroup(asset.pageIndex);
      const cx = obj.x + obj.width  / 2;
      const cy = obj.y + obj.height / 2;
      spriteBatch.drawRotated(
        cx, cy, obj.width, obj.height, obj.rotation,
        asset.u0, asset.v0, asset.u1, asset.v1,
        1, 1, 1, obj.opacity
      );
    }
    spriteBatch.flush(renderPass, binder);

    if (opts.debugDraw) {
      physicsBatch.begin();
      drawPhysicsDebug(physicsBatch, bridge.world, camera);
      physicsBatch.flush(renderPass, binder);
    }

    renderer.endFrame(commandEncoder, renderPass);
  }

  const loop = new GameLoop(update, render, (fps) => {
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
  });
  loop.start();

  if (showSplash) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const elapsed = performance.now() - splashStart;
      const wait = Math.max(0, 800 - elapsed);
      setTimeout(hideSplash, wait);
    }));
  }

  return { renderer, scene, camera, bridge, runtime, loop };
}

function hexToRgb01(hex) {
  const clean = String(hex).replace(/^#/, '');
  const n = parseInt(clean, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >>  8) & 0xff) / 255,
    b: ( n        & 0xff) / 255,
  };
}