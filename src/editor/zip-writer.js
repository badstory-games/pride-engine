/**
 * Минимальный ZIP-writer (store-only, без сжатия).
 *
 * Достаточно для упаковки набора текстовых и бинарных файлов в один
 * .zip, который откроется любым архиватором. Сжатие не делаем —
 * во-первых, модули и так неплохо жмутся внешним gzip, во-вторых,
 * для реализации deflate нужен либо большой словарь, либо встроенный
 * CompressionStream, а мы хотим работать в любом браузере без оговорок.
 *
 * Использование:
 *   const bytes = makeZip([
 *     { name: 'index.html', data: '...' },
 *     { name: 'assets/foo.png', data: uint8array },
 *   ]);
 *   downloadBlob(new Blob([bytes], { type: 'application/zip' }), 'game.zip');
 *
 * Формат ZIP: PKZIP APPNOTE 6.3.6, minimal viable.
 */

export function makeZip(files) {
  const enc = new TextEncoder();

  const entries = files.map((f) => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.data === 'string'
      ? enc.encode(f.data)
      : f.data;
    return {
      nameBytes,
      dataBytes,
      crc32: crc32(dataBytes),
      size: dataBytes.length,
    };
  });

  // Предварительный расчёт итогового размера.
  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.size;
    centralSize += 46 + e.nameBytes.length;
  }
  const eocdSize = 22;
  const total = localSize + centralSize + eocdSize;

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let offset = 0;
  const localOffsets = [];

  // ---------- Local file headers + data ----------
  for (const e of entries) {
    localOffsets.push(offset);

    view.setUint32(offset, 0x04034b50, true); offset += 4; // signature
    view.setUint16(offset, 20, true);         offset += 2; // version needed
    view.setUint16(offset, 0, true);          offset += 2; // flags
    view.setUint16(offset, 0, true);          offset += 2; // method = store
    view.setUint16(offset, 0, true);          offset += 2; // mod time
    view.setUint16(offset, 0x21, true);       offset += 2; // mod date = 1980-01-01
    view.setUint32(offset, e.crc32, true);    offset += 4;
    view.setUint32(offset, e.size, true);     offset += 4; // compressed size
    view.setUint32(offset, e.size, true);     offset += 4; // uncompressed size
    view.setUint16(offset, e.nameBytes.length, true); offset += 2;
    view.setUint16(offset, 0, true);          offset += 2; // extra length

    buf.set(e.nameBytes, offset);             offset += e.nameBytes.length;
    buf.set(e.dataBytes, offset);             offset += e.dataBytes.length;
  }

  const centralOffset = offset;

  // ---------- Central directory ----------
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    view.setUint32(offset, 0x02014b50, true); offset += 4;
    view.setUint16(offset, 20, true);         offset += 2; // version made by
    view.setUint16(offset, 20, true);         offset += 2; // version needed
    view.setUint16(offset, 0, true);          offset += 2; // flags
    view.setUint16(offset, 0, true);          offset += 2; // method
    view.setUint16(offset, 0, true);          offset += 2; // mod time
    view.setUint16(offset, 0x21, true);       offset += 2; // mod date
    view.setUint32(offset, e.crc32, true);    offset += 4;
    view.setUint32(offset, e.size, true);     offset += 4;
    view.setUint32(offset, e.size, true);     offset += 4;
    view.setUint16(offset, e.nameBytes.length, true); offset += 2;
    view.setUint16(offset, 0, true);          offset += 2; // extra
    view.setUint16(offset, 0, true);          offset += 2; // comment
    view.setUint16(offset, 0, true);          offset += 2; // disk number
    view.setUint16(offset, 0, true);          offset += 2; // internal attrs
    view.setUint32(offset, 0, true);          offset += 4; // external attrs
    view.setUint32(offset, localOffsets[i], true); offset += 4;

    buf.set(e.nameBytes, offset);             offset += e.nameBytes.length;
  }

  const centralEnd = offset;

  // ---------- End of central directory ----------
  view.setUint32(offset, 0x06054b50, true);   offset += 4;
  view.setUint16(offset, 0, true);            offset += 2; // this disk
  view.setUint16(offset, 0, true);            offset += 2; // disk with CD
  view.setUint16(offset, entries.length, true); offset += 2;
  view.setUint16(offset, entries.length, true); offset += 2;
  view.setUint32(offset, centralEnd - centralOffset, true); offset += 4;
  view.setUint32(offset, centralOffset, true); offset += 4;
  view.setUint16(offset, 0, true);            offset += 2; // comment length

  return buf;
}

// ============================================================
// CRC32 (таблица строится один раз)
// ============================================================

let CRC_TABLE = null;

function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      CRC_TABLE[i] = c >>> 0;
    }
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}