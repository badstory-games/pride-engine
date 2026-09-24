/**
 * Сериализация проекта Pride Engine.
 *
 * Формат .pride:
 *   [6 байт "PRIDE1"] [1 байт version=1] [gzip-сжатый JSON UTF-8]
 *
 * JSON (version 3):
 *   { version, scene, sheet, varsInitial, assets? }
 *
 * `assets` — карта id → data URL (image/png;base64,…). Опционально;
 * если ассеты не были собраны (нет assetManager или нет блобов),
 * поле отсутствует. Старые файлы без `assets` грузятся как прежде —
 * текстуры просто берутся из внешнего источника.
 *
 * `vars` (runtime) НЕ сохраняем — восстанавливаются из varsInitial при Play.
 */

const MAGIC = 'PRIDE1';
const CONTAINER_VERSION = 1;

export function packProject(project, assets = null) {
  const packed = {
    version: 3,
    scene:       project.scene.toJSON(),
    sheet:       project.sheet,
    varsInitial: project.varsInitial || {},
  };
  if (assets && Object.keys(assets).length > 0) {
    packed.assets = assets;
  }
  return packed;
}

export function unpackProject(data, scene) {
  scene.fromJSON(data.scene);
  return {
    sheet:       data.sheet || null,
    vars:        { ...(data.varsInitial || {}) },
    varsInitial: { ...(data.varsInitial || {}) },
    assets:      data.assets || {},
  };
}

/**
 * Собирает data URL'ы для всех текстур, использованных в сцене.
 * Возвращает пустую карту, если assetManager не передан.
 */
async function collectAssets(scene, assetManager) {
  const out = {};
  if (!assetManager) return out;

  const ids = new Set();
  for (const obj of (scene.objects || [])) {
    if (obj.textureId && obj.textureId !== '__white') ids.add(obj.textureId);
  }

  for (const id of ids) {
    const blob = assetManager.getSourceBlob(id);
    if (!blob) continue;
    try {
      out[id] = await blobToDataUrl(blob);
    } catch (e) {
      console.warn(`[serialize] asset "${id}" failed:`, e);
    }
  }
  return out;
}

export async function serializeProject(project, assetManager = null) {
  const assets  = await collectAssets(project.scene, assetManager);
  const payload = JSON.stringify(packProject(project, assets));
  const bytes   = new TextEncoder().encode(payload);
  const gz      = await gzipCompress(bytes);

  const out = new Uint8Array(MAGIC.length + 1 + gz.length);
  for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i);
  out[MAGIC.length] = CONTAINER_VERSION;
  out.set(gz, MAGIC.length + 1);
  return out;
}

export async function deserializeProject(bytes, scene, assetManager = null) {
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) {
      throw new Error('Not a .pride file (bad magic)');
    }
  }
  const version = bytes[MAGIC.length];
  if (version !== CONTAINER_VERSION) {
    throw new Error(`Unsupported .pride container version: ${version}`);
  }

  const gz     = bytes.subarray(MAGIC.length + 1);
  const raw    = await gzipDecompress(gz);
  const data   = JSON.parse(new TextDecoder().decode(raw));
  const result = unpackProject(data, scene);

  // Восстанавливаем текстуры, если они были вложены в файл.
  if (assetManager && result.assets) {
    for (const [id, dataUrl] of Object.entries(result.assets)) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const bmp  = await createImageBitmap(blob);
        assetManager.loadFromBitmap(id, bmp);
        // Сохраняем source blob — чтобы повторный экспорт .pride
        // и экспорт HTML-игры тоже могли использовать эти ассеты.
        assetManager.blobs.set(id, blob);
      } catch (e) {
        console.warn(`[deserialize] asset "${id}" failed:`, e);
      }
    }
  }

  return result;
}

// ---------- gzip через CompressionStream (fallback: без сжатия) ----------

async function gzipCompress(bytes) {
  if (typeof CompressionStream === 'undefined') return bytes;
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes) {
  if (typeof DecompressionStream === 'undefined') return bytes;
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}