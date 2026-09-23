export class AssetManager {
  constructor(device) {
    this.device = device;
    this.assets = new Map(); // id → { texture, width, height }
  }

  /** Загрузить PNG по URL через fetch + createImageBitmap. */
  async loadPNG(id, url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    return this._upload(id, bitmap);
  }

  /** Загрузить из уже готового ImageBitmap (например, процедурного). */
  loadFromBitmap(id, bitmap) {
    return this._upload(id, bitmap);
  }

  _upload(id, bitmap) {
    const width = bitmap.width;
    const height = bitmap.height;

    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      [width, height]
    );

    bitmap.close();

    const asset = { texture, width, height };
    this.assets.set(id, asset);
    return asset;
  }

  get(id) {
    return this.assets.get(id) || null;
  }
}