/**
 * Spatial hash grid.
 * Тела вставляются во все ячейки, которые пересекает их AABB.
 * Пары дедуплицируются через Set (для 3.1 приемлемо; на этапе 6 заменим
 * на плоский stamp-массив без аллокаций).
 */
export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cellSizeInv = 1 / cellSize;
    this.cells = new Map();          // key → number[]
    this.pairs = [];                  // flat: [a0,b0, a1,b1, ...]
    this._seen = new Set();
  }

  _key(cx, cy) {
    // uint32-упаковка двух 16-битных знаковых
    return ((cx + 0x8000) << 16) | ((cy + 0x8000) & 0xffff);
  }

  clear() {
    this.cells.clear();
    this.pairs.length = 0;
    this._seen.clear();
  }

  insert(index, minX, minY, maxX, maxY) {
    const inv = this.cellSizeInv;
    const x0 = Math.floor(minX * inv);
    const y0 = Math.floor(minY * inv);
    const x1 = Math.floor(maxX * inv);
    const y1 = Math.floor(maxY * inv);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this._key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(index);
      }
    }
  }

  /** Возвращает flat-массив пар без дублей: [a0,b0, a1,b1, ...]. */
  computePairs() {
    const pairs = this.pairs;
    const seen = this._seen;

    for (const bucket of this.cells.values()) {
      const n = bucket.length;
      for (let i = 0; i < n; i++) {
        const a = bucket[i];
        for (let j = i + 1; j < n; j++) {
          const b = bucket[j];
          if (a === b) continue;

          const lo = a < b ? a : b;
          const hi = a < b ? b : a;
          const key = lo * 0x100000 + hi;
          if (seen.has(key)) continue;
          seen.add(key);

          pairs.push(lo, hi);
        }
      }
    }
    return pairs;
  }
}