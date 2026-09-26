import { packProject } from '../project/serializer.js';
import { makeZip } from '../editor/zip-writer.js';
import { registry } from '../engine/events/registry.js';

const RUNTIME_ENTRY = new URL('./runtime-entry.js', import.meta.url).href;
const SRC_ROOT      = new URL('../', import.meta.url).href;

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#252525"/><path d="M 23 16 V 48 M 23 16 H 31 A 8 8 0 0 1 31 32 H 23" stroke="#7fa8d4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="23" cy="16" r="5" fill="#7fa8d4"/><circle cx="23" cy="48" r="5" fill="#7fa8d4"/><circle cx="41" cy="24" r="5" fill="#e6a540"/></svg>`;

export async function exportWebGame(project, options = {}) {
  const title        = options.title || 'Pride Game';
  const showSplash   = options.showSplash !== false;
  const debugOverlay = options.debugOverlay !== false;
  const debugPhysics = !!options.debugPhysics;
  const minify       = !!options.minify;
  const mode         = options.mode === 'folder' ? 'folder' : 'single';
  const assetManager = options.assetManager || null;

  const modules = await collectModules(RUNTIME_ENTRY);

  // Текстуры — только используемые объектами сцены.
  const imageIds = new Set();
  for (const obj of (project.scene.objects || [])) {
    if (obj._dead) continue;
    if (obj.textureId && obj.textureId !== '__white') imageIds.add(obj.textureId);
  }

  // Звуки — только те, что встречаются в событиях.
  const soundIds = collectUsedSoundIds(project.sheet);

  // Пользовательская иконка проекта (dataURL PNG 64×64), если задана.
  const projectIcon = isIconDataUrl(project.icon) ? project.icon : null;

  if (mode === 'folder') {
    return await buildFolderArchive({
      project, modules, imageIds, soundIds, assetManager, projectIcon,
      title, showSplash, debugOverlay, debugPhysics, minify,
    });
  }
  return await buildSingleFile({
    project, modules, imageIds, soundIds, assetManager, projectIcon,
    title, showSplash, debugOverlay, debugPhysics, minify,
  });
}

// ============================================================
// Проверка иконки
// ============================================================

function isIconDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:image/');
}

/**
 * Что положить в <link rel="icon">: пользовательскую иконку или
 * фирменный SVG. Data-URL PNG работает как favicon во всех
 * современных браузерах.
 */
function buildFaviconHref(projectIcon) {
  if (isIconDataUrl(projectIcon)) return projectIcon;
  return 'data:image/svg+xml;base64,' + base64EncodeUtf8(FAVICON_SVG);
}

// ============================================================
// Анализ событий: какие звуки используются
// ============================================================

function collectUsedSoundIds(sheet) {
  const ids = new Set();
  if (!sheet || !Array.isArray(sheet.events)) return ids;

  const visitItems = (defs, items) => {
    for (const item of (items || [])) {
      const def = defs.get(item.type);
      if (!def || !def.params) continue;
      for (const p of def.params) {
        if (p.type !== 'sound') continue;
        const val = item.params?.[p.id];
        if (val) ids.add(val);
      }
    }
  };

  const walk = (arr) => {
    for (const el of arr) {
      const k = el._type || 'event';
      if (k === 'comment') continue;
      if (k === 'group') {
        walk(el.children || []);
        continue;
      }
      visitItems(registry.conditions, el.conditions);
      visitItems(registry.actions, el.actions);
      if (el.children) walk(el.children);
    }
  };

  walk(sheet.events);
  return ids;
}

// ============================================================
// Single-file
// ============================================================

async function buildSingleFile({
  project, modules, imageIds, soundIds, assetManager, projectIcon,
  title, showSplash, debugOverlay, debugPhysics, minify,
}) {
  const importMap = {};
  for (const [url, source] of modules) {
    const relPath = url.startsWith(SRC_ROOT) ? url.slice(SRC_ROOT.length) : url;
    let src = rewriteRelativeImports(source, url, SRC_ROOT);
    if (minify) src = minifySource(src);
    importMap[relPath] = 'data:text/javascript;base64,' + base64Encode(src);
  }

  const images = {};
  const missingImages = [];
  for (const id of imageIds) {
    const blob = assetManager ? assetManager.getSourceBlob(id) : null;
    if (blob) {
      images[id] = await blobToDataUrl(blob);
      continue;
    }
    const fromNet = await tryFetchAsset(id);
    if (fromNet) images[id] = fromNet;
    else missingImages.push(id);
  }

  const sounds = {};
  const missingSounds = [];
  for (const id of soundIds) {
    const blob = assetManager ? assetManager.getAudioBlob(id) : null;
    if (blob) sounds[id] = await blobToDataUrl(blob);
    else missingSounds.push(id);
  }

  if (missingImages.length) {
    console.warn(`[export] не удалось упаковать текстуры: ${missingImages.join(', ')}`);
  }
  if (missingSounds.length) {
    console.warn(`[export] не удалось упаковать звуки: ${missingSounds.join(', ')}`);
  }

  const html = buildHtml({
    title,
    project: packProject(project),
    projectIcon,
    images,
    sounds,
    showSplash,
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
  project, modules, imageIds, soundIds, assetManager, projectIcon,
  title, showSplash, debugOverlay, debugPhysics, minify,
}) {
  const files = [];

  for (const [url, source] of modules) {
    const relPath = url.startsWith(SRC_ROOT) ? url.slice(SRC_ROOT.length) : url;
    let src = source;
    if (minify) src = minifySource(src);
    files.push({ name: relPath, data: src });
  }

  const images = {};
  const missingImages = [];
  for (const id of imageIds) {
    const blob = assetManager ? assetManager.getSourceBlob(id) : null;
    if (!blob) { missingImages.push(id); continue; }
    const ext = extFromMime(blob.type) || '.bin';
    const path = `assets/${id}${ext}`;
    files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    images[id] = path;
  }

  const sounds = {};
  const missingSounds = [];
  for (const id of soundIds) {
    const blob = assetManager ? assetManager.getAudioBlob(id) : null;
    if (!blob) { missingSounds.push(id); continue; }
    const ext = extFromMime(blob.type) || '.bin';
    const path = `audio/${id}${ext}`;
    files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    sounds[id] = path;
  }

  if (missingImages.length) {
    console.warn(`[export] не удалось упаковать текстуры: ${missingImages.join(', ')}`);
  }
  if (missingSounds.length) {
    console.warn(`[export] не удалось упаковать звуки: ${missingSounds.join(', ')}`);
  }

  const html = buildHtml({
    title,
    project: packProject(project),
    projectIcon,
    images,
    sounds,
    showSplash,
    debugOverlay,
    debugPhysics,
    moduleImport: `import { startGame } from './export/runtime-entry.js';`,
    importMapJson: null,
  });
  files.unshift({ name: 'index.html', data: html });

  files.push({ name: 'favicon.svg', data: FAVICON_SVG });

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

function minifySource(src) {
  let out = stripComments(src);
  out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  out = out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
  out = out.replace(/\n\n+/g, '\n');
  return out;
}

function stripComments(src) {
  const n = src.length;
  let out = '';
  let i = 0;
  let state = 'code';

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
    } catch {}
  }
  return null;
}

function extFromMime(type) {
  if (!type) return null;
  if (type === 'image/png')  return '.png';
  if (type === 'image/jpeg' || type === 'image/jpg') return '.jpg';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif')  return '.gif';
  if (type === 'audio/mpeg' || type === 'audio/mp3') return '.mp3';
  if (type === 'audio/ogg')  return '.ogg';
  if (type === 'audio/wav' || type === 'audio/wave' || type === 'audio/x-wav') return '.wav';
  if (type === 'audio/webm') return '.webm';
  if (type === 'audio/mp4')  return '.m4a';
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

function base64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
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

// ============================================================
// Splash
// ============================================================

/**
 * Splash-экран. Если у проекта есть пользовательская иконка — она
 * показывается в центре вместо фирменного логотипа. Обе версии
 * используют один и тот же класс .pride-splash-logo (одинаковый
 * размер 96×96 и центрирование), поэтому CSS общий.
 */
function buildSplashHtml(projectIcon) {
  const logoHtml = isIconDataUrl(projectIcon)
    ? `<img class="pride-splash-logo" src="${projectIcon}" alt="" draggable="false">`
    : `<svg class="pride-splash-logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M 32 8 L 52 20 L 52 44 L 32 56 L 12 44 L 12 20 Z"
            stroke="#7fa8d4" stroke-width="2" stroke-linejoin="round"
            fill="none" opacity="0.35"/>
      <path d="M 27 22 V 42 M 27 22 H 34 A 7 7 0 0 1 34 36 H 27"
            stroke="#7fa8d4" stroke-width="4"
            stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle class="node-1" cx="27" cy="22" r="4" fill="#7fa8d4"/>
      <circle class="node-2" cx="27" cy="42" r="4" fill="#7fa8d4"/>
      <circle class="node-3" cx="41" cy="29" r="4" fill="#e6a540"/>
    </svg>`;

  return `<div id="pride-splash" aria-hidden="true">
  <div class="pride-splash-inner">
    ${logoHtml}
    <div class="pride-splash-title">${isIconDataUrl(projectIcon) ? 'LOADING' : 'PRIDE ENGINE'}</div>
    <div class="pride-splash-progress"><div class="pride-splash-bar"></div></div>
  </div>
</div>`;
}

function buildSplashCss() {
  return `
  #pride-splash {
    position: fixed; inset: 0;
    background: #1a1a1a;
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    opacity: 1;
    transition: opacity 400ms ease;
    font: 13px system-ui, -apple-system, sans-serif;
  }
  #pride-splash.hidden { opacity: 0; pointer-events: none; }

  .pride-splash-inner {
    display: flex; flex-direction: column; align-items: center;
    gap: 20px;
    pointer-events: none;
  }
  .pride-splash-logo {
    width: 96px; height: 96px;
    display: block;
    object-fit: contain;
    border-radius: 16px;
  }
  .pride-splash-title {
    font: 600 13px system-ui, -apple-system, sans-serif;
    letter-spacing: 5px;
    text-transform: uppercase;
    color: #7fa8d4;
    opacity: 0.9;
    padding-left: 5px;
  }
  .pride-splash-progress {
    width: 180px; height: 3px;
    background: rgba(127, 168, 212, 0.15);
    border-radius: 2px; overflow: hidden;
    position: relative;
  }
  .pride-splash-bar {
    position: absolute; top: 0; bottom: 0; left: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, #7fa8d4, transparent);
    animation: pride-splash-progress 1.4s ease-in-out infinite;
    border-radius: 2px;
  }
  @keyframes pride-splash-progress {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .node-1 { animation: pride-node-pulse 1.8s ease-in-out infinite; }
  .node-2 { animation: pride-node-pulse 1.8s ease-in-out infinite 0.3s; }
  .node-3 {
    animation: pride-node-pulse-accent 1.8s ease-in-out infinite 0.6s;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes pride-node-pulse {
    0%, 100% { opacity: 0.5; }
    30%, 60% { opacity: 1; }
  }
  @keyframes pride-node-pulse-accent {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    30%, 60% { opacity: 1;   transform: scale(1.3); }
  }
`;
}

function buildHtml({
  title, project, projectIcon, images, sounds,
  showSplash, debugOverlay, debugPhysics,
  moduleImport, importMapJson,
}) {
  const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

  const projJson   = safe(project);
  const imagesJson = safe(images);
  const soundsJson = safe(sounds);

  const canvasW = project.canvasWidth  ?? 1024;
  const canvasH = project.canvasHeight ?? 640;
  const pageTitle = project.name || title || 'Pride Game';

  const importMapBlock = importMapJson
    ? `<script type="importmap">\n${importMapJson}\n</script>\n`
    : '';

  const fpsBlock = debugOverlay ? `<div id="fps">FPS: --</div>` : '';

  // Favicon: пользовательская иконка или фирменный SVG.
  const faviconData = buildFaviconHref(projectIcon);

  const splashHtml = showSplash ? buildSplashHtml(projectIcon) : '';
  const splashCss  = showSplash ? buildSplashCss()  : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(pageTitle)}</title>
<link rel="icon" href="${faviconData}">
<style>
  html, body { margin: 0; height: 100%; background: #1a1a1a; color: #ddd;
               font: 13px system-ui; overflow: hidden; }
  #wrap { position: absolute; inset: 0; display: flex;
          align-items: center; justify-content: center; }
  #pride-canvas { background: #2a2a2a; box-shadow: 0 0 0 1px #333;
                  display: block; }
  #fps { position: absolute; top: 8px; left: 8px; font: 12px monospace;
         background: rgba(0,0,0,0.6); padding: 3px 7px; border-radius: 3px;
         color: #8c8; pointer-events: none; z-index: 20; }
  .err { color: #f88; padding: 20px; font: 12px/1.4 monospace;
         white-space: pre-wrap; }
${splashCss}
</style>
</head>
<body>
${splashHtml}
<div id="wrap"><canvas id="pride-canvas" width="${canvasW}" height="${canvasH}"></canvas></div>
${fpsBlock}

${importMapBlock}<script>
window.__PRIDE_PROJECT__ = ${projJson};
window.__PRIDE_IMAGES__  = ${imagesJson};
window.__PRIDE_SOUNDS__  = ${soundsJson};
</script>

<script type="module">
${moduleImport}
startGame(
  window.__PRIDE_PROJECT__,
  window.__PRIDE_IMAGES__,
  window.__PRIDE_SOUNDS__,
  {
    debugDraw: ${debugPhysics ? 'true' : 'false'},
    showSplash: ${showSplash ? 'true' : 'false'}
  }
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