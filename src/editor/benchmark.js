/**
 * Бенчмарк: временно заселяет сцену N объектами с физикой,
 * прогоняет симуляцию и собирает статистику update/render/frame.
 * Сцена восстанавливается автоматически.
 */

/**
 * @param {object} opts
 * @param {Scene}  opts.scene
 * @param {PhysicsBridge} opts.bridge
 * @param {PerfOverlay}   opts.perfOverlay
 * @param {(v: boolean|null) => any} [opts.setDebugDraw]
 * @param {number[]} [opts.counts]
 * @param {number}   [opts.framesPerTest]
 * @returns {Promise<Array>}
 */
export async function runBenchmark({
  scene, bridge, perfOverlay,
  setDebugDraw = null,
  counts = [500, 1000, 2500, 5000],
  framesPerTest = 90,
}) {
  if (bridge.running) {
    throw new Error('Остановите Play (F7) перед запуском бенчмарка.');
  }

  const results = [];
  const savedNextId = scene.nextId;

  // Отключаем debug draw на весь прогон — он доминирует в vertex count.
  const prevDebug = setDebugDraw ? setDebugDraw(false) : null;

  try {
    for (const n of counts) {
      const startIdx = scene.objects.length;
      const startId  = scene.nextId;

      // ---------- spawn ----------
      const spawnStart = performance.now();
      for (let i = 0; i < n; i++) {
        const x = (i % 200) * 20;
        const y = Math.floor(i / 200) * 20 - 800;
        scene.add({
          x, y, width: 16, height: 16,
          textureId: 'player',
          name: 'bench',
          physics: {
            enabled: true, type: 'dynamic', shape: 'box',
            density: 1, friction: 0.5, restitution: 0.2, radius: 8,
          },
        });
      }
      const spawnMs = performance.now() - spawnStart;

      // ---------- run ----------
      bridge.start();

      const updateSamples = [];
      const renderSamples = [];
      const frameSamples  = [];
      let lastExtras = null;

      await new Promise((resolve) => {
        let count = 0;
        const tick = () => {
          updateSamples.push(perfOverlay.updateMs);
          renderSamples.push(perfOverlay.renderMs);
          frameSamples.push(perfOverlay.frameMs);
          lastExtras = { ...perfOverlay.extras };
          if (++count >= framesPerTest) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      bridge.stop();

      // ---------- cleanup ----------
      scene.objects.length = startIdx;
      scene.nextId = startId;
      scene.markLayersDirty();

      // ---------- stats ----------
      const warm = 20;
      const trim = (arr) => arr.slice(warm).filter((v) => v > 0);
      const stat = (arr) => {
        const a = trim(arr);
        if (!a.length) return { avg: 0, min: 0, max: 0 };
        let s = 0, mn = Infinity, mx = -Infinity;
        for (const v of a) { s += v; if (v < mn) mn = v; if (v > mx) mx = v; }
        return { avg: s / a.length, min: mn, max: mx };
      };

      results.push({
        n,
        spawnMs,
        update: stat(updateSamples),
        render: stat(renderSamples),
        frame:  stat(frameSamples),
        draws:      lastExtras ? lastExtras.drawCalls  : 0,
        verts:      lastExtras ? lastExtras.vertices   : 0,
        bodies:     lastExtras ? lastExtras.bodies     : 0,
        collisions: lastExtras ? lastExtras.collisions : 0,
      });
    }
  } finally {
    if (setDebugDraw) setDebugDraw(prevDebug);
  }

  scene.nextId = savedNextId;
  return results;
}

/**
 * Форматирует результаты в текст для Modal.alert.
 */
export function formatResults(results) {
  const lines = [];
  lines.push('Сцена временно заменялась. После теста всё восстановлено.');
  lines.push('');

  if (!results || !results.length) {
    lines.push('(нет данных)');
    return lines.join('\n');
  }

  for (const r of results) {
    lines.push(`${r.n} объектов  (spawn ${r.spawnMs.toFixed(1)} ms)`);
    lines.push(
      `  Update:  ${r.update.avg.toFixed(2)} ms  ` +
      `(min ${r.update.min.toFixed(2)}, max ${r.update.max.toFixed(2)})`
    );
    lines.push(
      `  Render:  ${r.render.avg.toFixed(2)} ms  ` +
      `(min ${r.render.min.toFixed(2)}, max ${r.render.max.toFixed(2)})`
    );
    lines.push(`  Frame:   ${r.frame.avg.toFixed(2)} ms`);
    lines.push(
      `  Draws: ${r.draws}   Verts: ${r.verts}   ` +
      `Bodies: ${r.bodies}   Collisions: ${r.collisions}`
    );
    lines.push('');
  }

  const worst = results[results.length - 1];
  if (worst) {
    const u  = worst.update.avg;
    const rr = worst.render.avg;
    let verdict;
    if (u > rr * 2)      verdict = 'UPDATE (физика / события)';
    else if (rr > u * 2) verdict = 'RENDER (vertex emit / draw)';
    else                 verdict = 'сбалансировано';
    lines.push(`Узкое место при ${worst.n} объектах: ${verdict}`);
  }

  return lines.join('\n');
}