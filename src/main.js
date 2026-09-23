import { Renderer } from './engine/renderer.js';
import { SpriteBatch } from './engine/sprite-batch.js';
import { GameLoop } from './engine/loop.js';

async function main() {
  const canvas = document.getElementById('pride-canvas');
  const fpsEl = document.getElementById('fps');

  const renderer = new Renderer();
  await renderer.init(canvas);
  renderer.updateProjection(canvas.width, canvas.height);

  const batch = new SpriteBatch(renderer.device, renderer.format);

  // Создаём простую текстуру-шахматку 64×64
  const size = 64;
  const imageData = new ImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const check = ((x >> 3) + (y >> 3)) % 2 === 0;

      imageData.data[i]     = check ? 255 : 100;
      imageData.data[i + 1] = check ? 100 : 255;
      imageData.data[i + 2] = check ? 100 : 100;
      imageData.data[i + 3] = 255;
    }
  }

  const bitmap = await createImageBitmap(imageData);

  const texture = renderer.device.createTexture({
    size: [size, size],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  renderer.device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    [size, size]
  );

  renderer.setTexture(texture);

  let time = 0;
  const sprite = { x: 100, y: 100, w: 64, h: 64 };

  function update(dt) {
    time += dt;
    sprite.x = 400 + Math.sin(time * 2) * 200 - sprite.w / 2;
    sprite.y = 300 + Math.cos(time * 1.5) * 150 - sprite.h / 2;
  }

  function render() {
    const { commandEncoder, renderPass } = renderer.beginFrame();

    batch.begin();
    batch.draw(
      sprite.x, sprite.y,
      sprite.w, sprite.h,
      0, 0, 1, 1,
      1, 1, 1, 1
    );
    batch.end(renderPass);

    renderer.endFrame(commandEncoder, renderPass);
  }

  const loop = new GameLoop(update, render, (fps) => {
    fpsEl.textContent = `FPS: ${fps}`;
  });

  loop.start();
}

main().catch(console.error);