import { packProject } from '../project/serializer.js';
import { makeZip } from '../editor/zip-writer.js';

const RUNTIME_ENTRY = new URL('./runtime-entry.js', import.meta.url).href;
const SRC_ROOT      = new URL('../', import.meta.url).href;

/**
 * Экспорт проекта в standalone-игру.
 *
 * Возвращает { blob, filename }:
 *   - mode='single' → game.html, всё инлайном.
 *   - mode='folder' → game.zip, отдельные модули и PNG.
 *
 * @param {object} project
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {boolean} [options.debugDraw]
 * @param {boolean} [options.debugOverlay=true]   счётчик FPS в углу
 * @param {boolean} [options.debugPhysics=false]  физический debug draw
 * @param {boolean} [options.minify=false]
 * @param {'single'|'folder'} [options.mode='single']
 * @param {AssetManager|null} [options.assetManager]
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function exportWebGame(project, options = {}) {
  const title        = options.title || 'Pride Game';
  const debugOverlay = options.debugOverlay !== false;
  const debugPhysics = !!options.debugPhysics;
  const minify       = !!options.minify;
  const mode         = options.mode === 'folder' ? 'folder' : 'single';
  const assetManager = options.assetManager || null;

  // --- 1. Собрать модули рантайма ---
  const modules = await collectModules(RUNTIME_ENTRY);

  // --- 2. Ассеты: список id из сцены ---
  const ids = new Set();
  for (const obj of (project.scene.objects || [])) {
    if (obj.textureId && obj.textureId !== '__white') ids.add(obj.textureId);
  }

  if (mode === 'folder') {
    return await buildFolderArchive({
      project, modules, ids, assetManager,
      title, debugOverlay, debugPhysics, minify,
    });
  }
  return await buildSingleFile({
    project, modules, ids, assetManager,
    title, debugOverlay, debugPhysics, minify,
  });
}

// ============================================================
// Single-file
// ============================================================

async function buildSingleFile({
  project, modules, ids, assetManager,
  title, debugOverlay, debugPhysics, minify,
}) {
  const importMap = {};
  for (const [url, source] of modules) {
    const relPath = url.startsWith(SRC_ROOT) ? url.slice(SRC_ROOT.length) : url;
    let src = rewriteRelativeImports(source, url, SRC_ROOT);
    if (minify) src = minifySource(src);
    importMap[relPath] = 'data:text/javascript;base64,' + base64Encode(src);
  }

  const assets = {};
  const missing = [];
  for (const id of ids) {
    const blob = assetManager ? assetManager.getSourceBlob(id) : null;
    if (blob) {
      assets[id] = await blobToDataUrl(blob);
      continue;
    }
    const fromNet = await tryFetchAsset(id);
    if (fromNet) assets[id] = fromNet;
    else missing.push(id);
  }

  if (missing.length) {
    console.warn(
      `[export] не удалось упаковать ассеты: ${missing.join(', ')}. ` +
      `Убедитесь, что они загружены через AssetManager.loadPNG.`
    );
  }

  const html = buildHtml({
    title,
    project: packProject(project),
    assets,
    debugOverlay,
    debugPhysics,
    moduleImport: `import { startGame } from 'export/runtime-entry.js';`,
    importMapJson: JSON.stringify({ imports: importMap }).replace(/</g, '\\u003c'),
  });

  return {
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename: 'game.html',
  };
}

// ============================================================
// Folder (zip)
// ============================================================

async function buildFolderArchive({
  project, modules, ids, assetManager,
  title, debugOverlay, debugPhysics, minify,
}) {
  const files = [];

  // 1. Модули под их относительными путями, импорты как есть.
  for (const [url, source] of modules) {
    const relPath = url.startsWith(SRC_ROOT) ? url.slice(SRC_ROOT.length) : url;
    let src = source;
    if (minify) src = minifySource(src);
    files.push({ name: relPath, data: src });
  }

  // 2. Ассеты как файлы.
  const assets = {};
  const missing = [];
  for (const id of ids) {
    const blob = assetManager ? assetManager.getSourceBlob(id) : null;
    if (!blob) {
      missing.push(id);
      continue;
    }
    const ext = extFromMime(blob.type) || '.bin';
    const path = `assets/${id}${ext}`;
    files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    assets[id] = path;
  }

  if (missing.length) {
    console.warn(
      `[export] не удалось упаковать ассеты: ${missing.join(', ')}.`
    );
  }

  // 3. HTML с относительным импортом.
  const html = buildHtml({
    title,
    project: packProject(project),
    assets,
    debugOverlay,
    debugPhysics,
    moduleImport: `import { startGame } from './export/runtime-entry.js';`,
    importMapJson: null,
  });
  files.unshift({ name: 'index.html', data: html });

  const bytes = makeZip(files);
  return {
    blob: new Blob([bytes], { type: 'application/zip' }),
    filename: 'game.zip',
  };
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

// ============================================================
// Minify
// ============================================================

/**
 * Лёгкая минификация ES-модуля:
 *   - вырезает комментарии (через FSM, не трогая строки/шаблоны);
 *   - нормализует переводы строк;
 *   - убирает trailing-пробелы и пустые строки.
 *
 * НЕ трогает идентификаторы, не схлопывает пробелы между токенами —
 * это безопасно для любого корректного JS, включая import/export.
 */
function minifySource(src) {
  let out = stripComments(src);
  out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  out = out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
  out = out.replace(/\n\n+/g, '\n');
  return out;
}

/**
 * FSM-обход: комментарии заменяются пробелами (переводы строк сохраняются),
 * содержимое строковых и шаблонных литералов остаётся как есть.
 */
function stripComments(src) {
  const n = src.length;
  let out = '';
  let i = 0;
  let state = 'code'; // 'code' | 'line' | 'block' | 'single' | 'double' | 'template'

  while (i < n) {
    const c  = src[i];
    const c2 = i + 1 < n ? src[i + 1] : '';

    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line';   out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block';  out += '  '; i += 2; continue; }
      if (c === "'") { state = 'single';   out += c; i++; continue; }
      if (c === '"') { state = 'double';   out += c; i++; continue; }
      if (c === '`') { state = 'template'; out += c; i++; continue; }
      out += c; i++; continue;
    }

    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; i++; continue; }
      out += ' '; i++; continue;
    }

    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n') ? '\n' : ' ';
      i++; continue;
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      const closing = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (c === '\\' && i + 1 < n) {
        out += c + src[i + 1];
        i += 2;
        continue;
      }
      out += c;
      if (c === closing) state = 'code';
      i++; continue;
    }
  }

  return out;
}

function findRelativeImports(source) {
  const clean = stripComments(source);
  const re = /(?:from\s+|import\s*\(\s*|import\s+)(['"])(\.\.?\/[^'"]+)\1/g;
  const out = [];
  let m;
  while ((m = re.exec(clean)) !== null) out.push(m[2]);
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
      if (res.ok) return await blobToDataUrl(await res.blob());
    } catch { /* ignore */ }
  }
  return null;
}

function extFromMime(type) {
  if (!type) return null;
  if (type === 'image/png')  return '.png';
  if (type === 'image/jpeg' || type === 'image/jpg') return '.jpg';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif')  return '.gif';
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

function buildHtml({
  title, project, assets,
  debugOverlay, debugPhysics,
  moduleImport, importMapJson,
}) {
  const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

  const projJson   = safe(project);
  const assetsJson = safe(assets);

  const canvasW = project.canvasWidth  ?? 1024;
  const canvasH = project.canvasHeight ?? 640;
  const pageTitle = project.name || title || 'Pride Game';

  const importMapBlock = importMapJson
    ? `<script type="importmap">\n${importMapJson}\n</script>\n`
    : '';

  const fpsBlock = debugOverlay
    ? `<div id="fps">FPS: --</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(pageTitle)}</title>
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
<div id="wrap"><canvas id="pride-canvas" width="${canvasW}" height="${canvasH}"></canvas></div>
${fpsBlock}

${importMapBlock}<script>
window.__PRIDE_PROJECT__ = ${projJson};
window.__PRIDE_ASSETS__  = ${assetsJson};
</script>

<script type="module">
${moduleImport}
startGame(
  window.__PRIDE_PROJECT__,
  window.__PRIDE_ASSETS__,
  { debugDraw: ${debugPhysics ? 'true' : 'false'} }
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