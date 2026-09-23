export class SpriteBatch {
  constructor(device, format, maxVertices = 100_000) {
    this.device = device;
    this.maxVertices = maxVertices;
    this.maxIndices = (maxVertices / 4) * 6;

    this.vertexData = new Float32Array(maxVertices * 8);
    this.indexData = new Uint32Array(this.maxIndices);

    this.vertexCount = 0;
    this.indexCount = 0;

    /** Группы в текущем кадре: { textureId, vertexOffset, indexOffset, indexCount }. */
    this.groups = [];
    this._currentGroup = null;

    this.vertexBuffer = device.createBuffer({
      size: this.vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.indexBuffer = device.createBuffer({
      size: this.indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
  }

  begin() {
    this.vertexCount = 0;
    this.indexCount = 0;
    this.groups.length = 0;
    this._currentGroup = null;
  }

  /**
   * Открыть новую группу для textureId.
   * Если текущая группа уже с тем же textureId — ничего не делает,
   * то есть подряд идущие объекты одной текстуры склеиваются в один draw.
   */
  beginGroup(textureId) {
    if (this._currentGroup && this._currentGroup.textureId === textureId) return;
    if (this._currentGroup) this.endGroup();
    this._currentGroup = {
      textureId,
      vertexOffset: this.vertexCount,
      indexOffset: this.indexCount,
      indexCount: 0,
    };
  }

  endGroup() {
    if (!this._currentGroup) return;
    this._currentGroup.indexCount = this.indexCount - this._currentGroup.indexOffset;
    this.groups.push(this._currentGroup);
    this._currentGroup = null;
  }

  draw(x, y, w, h, u0, v0, u1, v1, r = 1, g = 1, b = 1, a = 1) {
    if (this.vertexCount + 4 > this.maxVertices) {
      throw new Error('SpriteBatch overflow');
    }

    const vd = this.vertexData;
    let offset = this.vertexCount * 8;

    vd[offset++] = x;     vd[offset++] = y;
    vd[offset++] = u0;    vd[offset++] = v0;
    vd[offset++] = r;     vd[offset++] = g; vd[offset++] = b; vd[offset++] = a;

    vd[offset++] = x + w; vd[offset++] = y;
    vd[offset++] = u1;    vd[offset++] = v0;
    vd[offset++] = r;     vd[offset++] = g; vd[offset++] = b; vd[offset++] = a;

    vd[offset++] = x + w; vd[offset++] = y + h;
    vd[offset++] = u1;    vd[offset++] = v1;
    vd[offset++] = r;     vd[offset++] = g; vd[offset++] = b; vd[offset++] = a;

    vd[offset++] = x;     vd[offset++] = y + h;
    vd[offset++] = u0;    vd[offset++] = v1;
    vd[offset++] = r;     vd[offset++] = g; vd[offset++] = b; vd[offset++] = a;

    const base = this.vertexCount;
    const id = this.indexData;
    let io = this.indexCount;

    id[io++] = base;     id[io++] = base + 1; id[io++] = base + 2;
    id[io++] = base;     id[io++] = base + 2; id[io++] = base + 3;

    this.vertexCount += 4;
    this.indexCount  += 6;
  }

  drawRotated(cx, cy, w, h, rotation, u0, v0, u1, v1, r = 1, g = 1, b = 1, a = 1) {
    if (this.vertexCount + 4 > this.maxVertices) {
      throw new Error('SpriteBatch overflow');
    }

    const hw = w / 2;
    const hh = h / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const lx = [-hw,  hw,  hw, -hw];
    const ly = [-hh, -hh,  hh,  hh];

    const vd = this.vertexData;
    let offset = this.vertexCount * 8;

    for (let i = 0; i < 4; i++) {
      const wx = cx + lx[i] * cos - ly[i] * sin;
      const wy = cy + lx[i] * sin + ly[i] * cos;

      const u = (i === 0 || i === 3) ? u0 : u1;
      const v = (i < 2) ? v0 : v1;

      vd[offset++] = wx; vd[offset++] = wy;
      vd[offset++] = u;  vd[offset++] = v;
      vd[offset++] = r;  vd[offset++] = g;
      vd[offset++] = b;  vd[offset++] = a;
    }

    const base = this.vertexCount;
    const id = this.indexData;
    let io = this.indexCount;

    id[io++] = base;     id[io++] = base + 1; id[io++] = base + 2;
    id[io++] = base;     id[io++] = base + 2; id[io++] = base + 3;

    this.vertexCount += 4;
    this.indexCount  += 6;
  }

  /**
   * Один writeBuffer в vertex/index — затем по одному drawIndexed на группу.
   * binder(textureId) вызывается перед каждой группой, чтобы привязать текстуру.
   * Если binder не передан (grid/overlay — одна текстура на весь батч),
   * предполагается, что текстура уже привязана снаружи.
   */
  flush(renderPass, binder = null) {
    if (this._currentGroup) this.endGroup();
    if (this.indexCount === 0) return;

    // Неявная одна группа, если beginGroup не вызывали вообще
    if (this.groups.length === 0) {
      this.groups.push({
        textureId: null,
        vertexOffset: 0,
        indexOffset: 0,
        indexCount: this.indexCount,
      });
    }

    this.device.queue.writeBuffer(
      this.vertexBuffer, 0,
      this.vertexData.buffer, 0,
      this.vertexCount * 8 * 4
    );

    this.device.queue.writeBuffer(
      this.indexBuffer, 0,
      this.indexData.buffer, 0,
      this.indexCount * 4
    );

    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint32');

    for (const g of this.groups) {
      if (binder) binder(g.textureId);
      renderPass.drawIndexed(g.indexCount, 1, g.indexOffset, 0, 0);
    }
  }
}