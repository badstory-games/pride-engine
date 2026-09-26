/**
 * TextureAtlas — одна страница атласа фиксированного размера.
 *
 * Упаковщик: shelf packing. Изображения кладутся слева направо в текущую
 * «полку» фиксированной высоты (высота = самый высокий элемент в полке).
 * Когда полка заполнена — открывается следующая строка.
 *
 * Простой алгоритм, но даёт 60–80% заполнения на типичном наборе
 * игровых PNG. Для сложных случаев (сильно разнородные размеры) можно
 * позже заменить на MaxRects — интерфейс страницы этого не заметит.
 *
 * padding вокруг каждой картинки защищает от bleeding при мипмаппинге
 * и линейной фильтрации. Для nearest-фильтра он тоже не мешает.
 */
export class TextureAtlas {
  constructor(device, size = 4096, padding = 2) {
    this.device = device;
    this.size = size;
    this.padding = padding;

    // Текущее состояние упаковки.
    this._cursorX = 0;    // X внутри текущей полки
    this._shelfY  = 0;    // Y текущей полки
    this._shelfH  = 0;    // высота текущей полки

    this.texture = device.createTexture({
      size: [size, size],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Очищаем в прозрачный цвет. WebGPU не гарантирует начальное
    // содержимое, а неиспользуемые области должны быть прозрачными,
    // чтобы случайные UV не подтягивали мусор.
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.texture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    // Сколько свободного места осталось в процентах (для диагностики).
    this.usedPixels = 0;
  }

  /**
   * Проверяет, влезет ли картинка при текущем состоянии полок.
   * Не изменяет состояние.
   */
  canFit(width, height) {
    const pad = this.padding;
    const w = width  + pad * 2;
    const h = height + pad * 2;

    if (w > this.size || h > this.size) return false;

    let cursorX = this._cursorX;
    let shelfY  = this._shelfY;
    let shelfH  = this._shelfH;

    if (cursorX + w > this.size) {
      shelfY += shelfH;
      shelfH = 0;
      cursorX = 0;
    }

    return shelfY + h <= this.size;
  }

  /**
   * Размещает битмап. Возвращает UV-прямоугольник или null,
   * если места не нашлось (в этом случае состояние не меняется).
   */
  tryAdd(bitmap, width, height) {
    if (!this.canFit(width, height)) return null;

    const pad = this.padding;
    const w = width  + pad * 2;
    const h = height + pad * 2;

    // Переходим на новую полку, если текущая переполнена.
    if (this._cursorX + w > this.size) {
      this._shelfY += this._shelfH;
      this._shelfH = 0;
      this._cursorX = 0;
    }

    const x = this._cursorX;
    const y = this._shelfY;

    this._cursorX += w;
    if (h > this._shelfH) this._shelfH = h;
    this.usedPixels += w * h;

    // Копируем пиксели. Origin — левый верхний угол ячейки (без padding,
    // padding остаётся прозрачным фоном вокруг).
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: this.texture, origin: [x + pad, y + pad] },
      [width, height]
    );

    // UV-прямоугольник указывает на сам пиксель без padding —
    // так sprite не «выглядывает» за свои границы.
    const u0 = (x + pad) / this.size;
    const v0 = (y + pad) / this.size;
    const u1 = (x + pad + width) / this.size;
    const v1 = (y + pad + height) / this.size;

    return { u0, v0, u1, v1 };
  }

  destroy() {
    this.texture.destroy();
  }
}