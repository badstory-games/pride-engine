/**
 * SpriteBatch на инстансинге WebGPU.
 *
 * Статический quad (4 вершины, 6 индексов) + instance buffer. Группировка
 * по страницам атласа: beginGroup(pageIndex) закрывает предыдущую группу
 * и открывает новую с тем же pageIndex. Все спрайты одной страницы
 * рисуются одним drawIndexed(6, N, 0, 0, firstInstance).
 *
 * Так как обычно всё лежит в одной странице атласа, в норме получается
 * один draw call на весь батч.
 *
 * Instance layout (52 байта):
 *   offset  0: inst_pos     float32x2   центр спрайта в мире
 *   offset  8: inst_size    float32x2   ширина, высота
 *   offset 16: inst_rot     float32     угол в радианах
 *   offset 20: inst_uv0     float32x2   u0, v0
 *   offset 28: inst_uv1     float32x2   u1, v1
 *   offset 36: inst_color   float32x4   r, g, b, a
 */
export class SpriteBatch {
  constructor(device, format, maxInstances = 65536) {
    this.device = device;
    this.format = format;

    this.maxInstances = maxInstances;

    // ---------- Статический quad ----------
    const quadData = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);
    const quadIndices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    this.quadVertexBuffer = device.createBuffer({
      size: quadData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadVertexBuffer, 0, quadData);

    this.quadIndexBuffer = device.createBuffer({
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadIndexBuffer, 0, quadIndices);

    // ---------- Instance buffer ----------
    this.instanceData = new Float32Array(maxInstances * 13);
    this.instanceBuffer = device.createBuffer({
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    /**
     * Буферы, ожидающие уничтожения. Старый instance buffer после _grow
     * нельзя destroy() сразу — GPU-команды предыдущего кадра могли ещё
     * ссылаться на него. Уничтожаем в начале следующего begin().
     * @type {GPUBuffer[]}
     */
    this._pendingDestroy = [];

    this.instanceCount = 0;

    /** @type {{pageIndex:number, firstInstance:number, instanceCount:number}[]} */
    this.groups = [];
    this._currentGroup = null;

    /**
     * UV белого пикселя. Устанавливается извне (main.js) после загрузки
     * AssetManager и используется в drawColor / drawRotatedColor.
     */
    this._whiteUV = { u0: 0, v0: 0, u1: 1, v1: 1 };
  }

  get vertexCount() {
    return this.instanceCount * 4;
  }

  /**
   * Устанавливает UV-прямоугольник системной текстуры __white.
   * Обязательно вызывать после инициализации AssetManager, иначе
   * drawColor будет рисовать «мусор» из левого верхнего угла атласа.
   */
  setWhiteUV(uv) {
    if (!uv) return;
    this._whiteUV = {
      u0: uv.u0, v0: uv.v0, u1: uv.u1, v1: uv.v1,
    };
  }

  // ============================================================
  // Frame lifecycle
  // ============================================================

  begin() {
    // Уничтожаем буферы, отложенные с прошлого кадра — все submits
    // предыдущего кадра к этому моменту завершены.
    if (this._pendingDestroy.length > 0) {
      for (const buf of this._pendingDestroy) {
        try { buf.destroy(); } catch { /* ignore */ }
      }
      this._pendingDestroy.length = 0;
    }

    this.instanceCount = 0;
    this.groups.length = 0;
    this._currentGroup = null;
  }

  beginGroup(pageIndex) {
    if (this._currentGroup && this._currentGroup.pageIndex === pageIndex) return;
    if (this._currentGroup) this.endGroup();
    this._currentGroup = {
      pageIndex,
      firstInstance: this.instanceCount,
      instanceCount: 0,
    };
  }

  endGroup() {
    if (!this._currentGroup) return;
    this._currentGroup.instanceCount =
      this.instanceCount - this._currentGroup.firstInstance;
    this.groups.push(this._currentGroup);
    this._currentGroup = null;
  }

  // ============================================================
  // Draw — с явными UV
  // ============================================================

  draw(x, y, w, h, u0, v0, u1, v1, r = 1, g = 1, b = 1, a = 1) {
    this._emit(
      x + w * 0.5, y + h * 0.5,
      w, h, 0,
      u0, v0, u1, v1,
      r, g, b, a
    );
  }

  drawRotated(cx, cy, w, h, rotation, u0, v0, u1, v1, r = 1, g = 1, b = 1, a = 1) {
    this._emit(cx, cy, w, h, rotation, u0, v0, u1, v1, r, g, b, a);
  }

  // ============================================================
  // Draw — цветной прямоугольник через __white
  // ============================================================

  drawColor(x, y, w, h, r = 1, g = 1, b = 1, a = 1) {
    const uv = this._whiteUV;
    this._emit(
      x + w * 0.5, y + h * 0.5,
      w, h, 0,
      uv.u0, uv.v0, uv.u1, uv.v1,
      r, g, b, a
    );
  }

  drawRotatedColor(cx, cy, w, h, rotation, r = 1, g = 1, b = 1, a = 1) {
    const uv = this._whiteUV;
    this._emit(cx, cy, w, h, rotation, uv.u0, uv.v0, uv.u1, uv.v1, r, g, b, a);
  }

  // ============================================================
  // Internal
  // ============================================================

  _emit(cx, cy, w, h, rot, u0, v0, u1, v1, r, g, b, a) {
    if (this.instanceCount + 1 > this.maxInstances) this._grow();

    const d = this.instanceData;
    let i = this.instanceCount * 13;

    d[i++] = cx;
    d[i++] = cy;
    d[i++] = w;
    d[i++] = h;
    d[i++] = rot;
    d[i++] = u0;
    d[i++] = v0;
    d[i++] = u1;
    d[i++] = v1;
    d[i++] = r;
    d[i++] = g;
    d[i++] = b;
    d[i++] = a;

    this.instanceCount++;
  }

  _grow() {
    const oldMax = this.maxInstances;
    const newMax = oldMax * 2;

    const oldData = this.instanceData;
    this.instanceData = new Float32Array(newMax * 13);
    this.instanceData.set(oldData);

    // НЕ уничтожаем старый буфер сразу — GPU-команды, отправленные
    // в предыдущем кадре, могут всё ещё ссылаться на него. Откладываем
    // до следующего begin(), где уничтожение уже безопасно.
    if (this.instanceBuffer) {
      this._pendingDestroy.push(this.instanceBuffer);
    }
    this.instanceBuffer = this.device.createBuffer({
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.maxInstances = newMax;
  }

  /**
   * Один writeBuffer на instance data + по одному drawIndexed на группу.
   *
   * binder(pageIndex) обязан вернуть true, если он успешно установил
   * bind group. Если возвращает false — группа пропускается, иначе
   * WebGPU сгенерирует ошибку «No bind group set at group index 0».
   * Если binder не возвращает ничего (undefined), считаем, что
   * bind group уже установлен и можно рисовать — обратная совместимость.
   */
  flush(renderPass, binder = null) {
    if (this._currentGroup) this.endGroup();
    if (this.instanceCount === 0) return;

    if (this.groups.length === 0) {
      this.groups.push({
        pageIndex: 0,
        firstInstance: 0,
        instanceCount: this.instanceCount,
      });
    }

    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.instanceData.buffer,
      0,
      this.instanceCount * 13 * 4
    );

    renderPass.setVertexBuffer(0, this.quadVertexBuffer);
    renderPass.setVertexBuffer(1, this.instanceBuffer);
    renderPass.setIndexBuffer(this.quadIndexBuffer, 'uint32');

    for (const g of this.groups) {
      if (binder) {
        const ok = binder(g.pageIndex);
        if (ok === false) continue;
      }
      renderPass.drawIndexed(6, g.instanceCount, 0, 0, g.firstInstance);
    }
  }
}