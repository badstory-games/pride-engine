import { packProject } from '../project/serializer.js';

const RUNTIME_ENTRY = new URL('./runtime-entry.js', import.meta.url).href;
const SRC_ROOT      = new URL('../', import.meta.url).href;   // .../src/

export async function exportWebGame(project, options = {}) {
  const title        = options.title || 'Pride Game';
  const debugDraw    = !!options.debugDraw;
  const assetManager = options.assetManager || null;

  // --- 1. Собрать модули рантайма ---
  const modules = await collectModules(RUNTIME_ENTRY);

  const importMap = {};
  for (const [url, source] of modules) {
    const relPath   = url.startsWith(SRC_ROOT) ? url.slice(SRC_ROOT.length) : url;
    const rewritten = rewriteRelativeImports(source, url, SRC_ROOT);
    importMap[relPath] = 'data:text/javascript;base64,' + base64Encode(rewritten);
  }

  // --- 2. Список id ассетов: из сцены, не хардкод ---
  const ids = new Set();
  for (const obj of (project.scene.objects || [])) {
    if (obj.textureId && obj.textureId !== '__white') ids.add(obj.textureId);
  }

  // --- 3. Ассеты: blob из редактора → data URL ---
  const assets  = {};
  const missing = [];

  for (const id of ids) {
    const blob = assetManager ? assetManager.getSourceBlob(id) : null;
    if (blob) {
      assets[id] = await blobToDataUrl(blob);
      continue;
    }
    // Fallback: попробовать по сети (например, если ассет создан не loadPNG)
    const fromNet = await tryFetchAsset(id);
    if (fromNet) {
      assets[id] = fromNet;
    } else {
      missing.push(id);
    }
  }

  if (missing.length) {
    console.warn(
      `[export] не удалось упаковать ассеты: ${missing.join(', ')}. ` +
      `Убедитесь, что они загружены через AssetManager.loadPNG.`
    );
  }

  return buildHtml({
    title,
    importMap,
    project: packProject(project),
    assets,
    debugDraw,
  });
}

// ============================================================
// Сбор модулей
// ============================================================

async function collectModules(rootUrl) {
  const out   = new Map();
  const queue = [rootUrl];

  while (queue.length) {
    const url = queue.shift();
    if (out.has(url)) continue;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
    const source = await res.text();
    out.set(url, source);

    for (const spec of findRelativeImports(source)) {
      queue.push(new URL(spec, url).href);
    }
  }
  return out;
}

function findRelativeImports(source) {
  const re = /(?:from\s+|import\s*\(\s*|import\s+)(['"])(\.\.?\/[^'"]+)\1/g;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) out.push(m[2]);
  return out;
}

function rewriteRelativeImports(source, fromUrl, baseUrl) {
  return source.replace(
    /((?:from\s+|import\s*\(\s*|import\s+))(['"])(\.\.?\/[^'"]+)\2/g,
    (_match, prefix, quote, spec) => {
      const resolved = new URL(spec, fromUrl).href;
      const rel = resolved.startsWith(baseUrl)
        ? resolved.slice(baseUrl.length)
        : resolved;
      return `${prefix}${quote}${rel}${quote}`;
    }
  );
}

// ============================================================
// Ассеты
// ============================================================

async function tryFetchAsset(id) {
  const candidates = [
    `./assets/${id}.png`,
    `./src/assets/${id}.png`,
    `/assets/${id}.png`,
  ];
  for (const path of candidates) {
    try {
      const url = new URL(path, document.baseURI).href;
      const res = await fetch(url);
      if (res.ok) {
        return await blobToDataUrl(await res.blob());
      }
    } catch { /* ignore */ }
  }
  return null;
}

// ============================================================
// Утилиты
// ============================================================

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function buildHtml({ title, importMap, project, assets, debugDraw }) {
  // Экранируем "<", чтобы "</script>" в данных не порвал <script>-тег.
  const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

  const imJson     = safe({ imports: importMap });
  const projJson   = safe(project);
  const assetsJson = safe(assets);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #1a1a1a; color: #ddd;
               font: 13px system-ui; overflow: hidden; }
  #wrap { position: absolute; inset: 0; display: flex;
          align-items: center; justify-content: center; }
  #pride-canvas { background: #2a2a2a; box-shadow: 0 0 0 1px #333;
                  display: block; }
  #fps { position: absolute; top: 8px; left: 8px; font: 12px monospace;
         background: rgba(0,0,0,0.6); padding: 3px 7px; border-radius: 3px;
         color: #8c8; pointer-events: none; }
  .err { color: #f88; padding: 20px; font: 12px/1.4 monospace;
         white-space: pre-wrap; }
</style>
</head>
<body>
<div id="wrap"><canvas id="pride-canvas" width="1024" height="640"></canvas></div>
<div id="fps">FPS: --</div>

<script type="importmap">
${imJson}
</script>

<script>
window.__PRIDE_PROJECT__ = ${projJson};
window.__PRIDE_ASSETS__  = ${assetsJson};
</script>

<script type="module">
import { startGame } from 'export/runtime-entry.js';
startGame(
  window.__PRIDE_PROJECT__,
  window.__PRIDE_ASSETS__,
  { debugDraw: ${debugDraw ? 'true' : 'false'} }
).catch((e) => {
  console.error(e);
  document.body.innerHTML =
    '<pre class="err">' + (e && e.stack ? e.stack : String(e)) + '</pre>';
});
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}