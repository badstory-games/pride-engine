/**
 * Сериализация проекта Pride Engine.
 *
 * Формат .pride:
 *   [6 байт "PRIDE1"] [1 байт version=1] [gzip-сжатый JSON UTF-8]
 *
 * JSON (version 7):
 *   { version, scene, sheet, varsInitial,
 *     name, icon, canvasWidth, canvasHeight, bgColor,
 *     gravityX, gravityY, assetsScope }
 *
 * ВАЖНО про CompressionStream / DecompressionStream.
 *
 * Поток имеет ограниченный внутренний буфер. Если сначала полностью
 * записать данные в writable, а только потом начать читать readable,
 * на данных больше буфера writer.write() блокируется навсегда —
 * классический deadlock. Поэтому чтение запускается ПАРАЛЛЕЛЬНО записи.
 */

const MAGIC = 'PRIDE1';
const CONTAINER_VERSION = 1;

function normalizeIcon(v) {
  if (typeof v !== 'string') return null;
  return v.startsWith('data:image/') ? v : null;
}

export function packProject(project) {
  return {
    version: 7,
    scene:        project.scene.toJSON(),
    sheet:        project.sheet,
    varsInitial:  project.varsInitial || {},
    name:         project.name        || 'Pride Project',
    icon:         normalizeIcon(project.icon),
    canvasWidth:  project.canvasWidth  ?? 1024,
    canvasHeight: project.canvasHeight ?? 640,
    bgColor:      project.bgColor     || '#333333',
    gravityX:     project.gravityX ?? 0,
    gravityY:     project.gravityY ?? 980,
    assetsScope:  project.assetsScope || null,
  };
}

export function unpackProject(data, scene) {
  scene.fromJSON(data.scene);
  return {
    sheet:        data.sheet || null,
    vars:         { ...(data.varsInitial || {}) },
    varsInitial:  { ...(data.varsInitial || {}) },
    name:         data.name        || 'Pride Project',
    icon:         normalizeIcon(data.icon),
    canvasWidth:  data.canvasWidth  ?? 1024,
    canvasHeight: data.canvasHeight ?? 640,
    bgColor:      data.bgColor     || '#333333',
    gravityX:     data.gravityX ?? 0,
    gravityY:     data.gravityY ?? 980,
    assetsScope:  data.assetsScope || null,
  };
}

export async function serializeProject(project) {
  const payload = JSON.stringify(packProject(project));
  const bytes   = new TextEncoder().encode(payload);
  const gz      = await gzipCompress(bytes);

  const out = new Uint8Array(MAGIC.length + 1 + gz.length);
  for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i);
  out[MAGIC.length] = CONTAINER_VERSION;
  out.set(gz, MAGIC.length + 1);
  return out;
}

export async function deserializeProject(bytes, scene) {
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) {
      throw new Error('Not a .pride file (bad magic)');
    }
  }
  const version = bytes[MAGIC.length];
  if (version !== CONTAINER_VERSION) {
    throw new Error(`Unsupported .pride container version: ${version}`);
  }

  const gz   = bytes.subarray(MAGIC.length + 1);
  const raw  = await gzipDecompress(gz);
  const data = JSON.parse(new TextDecoder().decode(raw));
  return unpackProject(data, scene);
}

async function gzipCompress(bytes) {
  if (typeof CompressionStream === 'undefined') return bytes;

  const cs = new CompressionStream('gzip');
  const readPromise = new Response(cs.readable).arrayBuffer();

  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();

  const buf = await readPromise;
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes) {
  if (typeof DecompressionStream === 'undefined') return bytes;

  const ds = new DecompressionStream('gzip');
  const readPromise = new Response(ds.readable).arrayBuffer();

  const writer = ds.writable.getWriter();
  await writer.write(bytes);
  await writer.close();

  const buf = await readPromise;
  return new Uint8Array(buf);
}