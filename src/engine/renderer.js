export class Renderer {
  constructor() {
    this.device = null;
    this.context = null;
    this.format = null;
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.sampler = null;
    this.texture = null;
    this.uniformData = new Float32Array(16);

    this._bgl = null;
    this._bindGroupCache = new Map();

    // Цвет очистки канваса. Значения 0..1.
    this.clearColor = { r: 0.2, g: 0.2, b: 0.2, a: 1.0 };
  }

  async init(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU не поддерживается');

    this.device = await adapter.requestDevice();
    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.createPipeline();
    this.createUniforms();
    this.createSampler();

    // Кэшируем layout один раз — используется в setTexture.
    this._bgl = this.pipeline.getBindGroupLayout(0);
  }

  createPipeline() {
    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [
          // Слот 0 — статический quad: только corner, шаг «по вершине».
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },  // corner
            ],
          },
          // Слот 1 — инстанс-данные: шаг «по инстансу», 52 байта.
          {
            arrayStride: 52,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0,  format: 'float32x2' },  // inst_pos
              { shaderLocation: 2, offset: 8,  format: 'float32x2' },  // inst_size
              { shaderLocation: 3, offset: 16, format: 'float32'   },  // inst_rot
              { shaderLocation: 4, offset: 20, format: 'float32x2' },  // inst_uv0
              { shaderLocation: 5, offset: 28, format: 'float32x2' },  // inst_uv1
              { shaderLocation: 6, offset: 36, format: 'float32x4' },  // inst_color
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  createUniforms() {
    this.uniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  createSampler() {
    this.sampler = this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
    });
  }

  setClearColor(r, g, b, a = 1) {
    this.clearColor.r = r;
    this.clearColor.g = g;
    this.clearColor.b = b;
    this.clearColor.a = a;
  }

  /**
   * Освобождает bind-group, привязанный к текстуре. Вызывается извне
   * (AssetManager → onTextureDisposed) в момент, когда текстура
   * уже не используется и будет уничтожена.
   */
  releaseTexture(texture) {
    if (!texture) return;
    this._bindGroupCache.delete(texture);
    if (this.texture === texture) {
      this.texture = null;
      this.bindGroup = null;
    }
  }

  setTexture(texture, sampler) {
    this.texture = texture;
    this.sampler = sampler || this.sampler;

    let bg = this._bindGroupCache.get(texture);
    if (!bg) {
      bg = this.device.createBindGroup({
        layout: this._bgl,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: texture.createView() },
        ],
      });
      this._bindGroupCache.set(texture, bg);
    }
    this.bindGroup = bg;
  }

  beginFrame() {
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { ...this.clearColor },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(this.pipeline);
    if (this.bindGroup) renderPass.setBindGroup(0, this.bindGroup);

    return { commandEncoder, renderPass };
  }

  endFrame(commandEncoder, renderPass) {
    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }
}

const shaderCode = `
struct Uniforms {
  projection: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VertexInput {
  // Статический quad: corner ∈ {0,1}².
  @location(0) corner: vec2<f32>,

  // Per-instance данные.
  @location(1) inst_pos:   vec2<f32>,
  @location(2) inst_size:  vec2<f32>,
  @location(3) inst_rot:   f32,
  @location(4) inst_uv0:   vec2<f32>,
  @location(5) inst_uv1:   vec2<f32>,
  @location(6) inst_color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // corner: (0,0)..(1,1) → локальные координаты (-0.5..0.5)
  let local = input.corner - vec2<f32>(0.5, 0.5);

  // Масштаб на размер инстанса.
  let scaled = local * input.inst_size;

  // Поворот вокруг центра.
  let c = cos(input.inst_rot);
  let s = sin(input.inst_rot);
  let rotated = vec2<f32>(
    scaled.x * c - scaled.y * s,
    scaled.x * s + scaled.y * c
  );

  // Сдвиг в мировую позицию центра.
  let world = input.inst_pos + rotated;

  output.position = uniforms.projection * vec4<f32>(world, 0.0, 1.0);
  output.uv = mix(input.inst_uv0, input.inst_uv1, input.corner);
  output.color = input.inst_color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let texColor = textureSample(tex, texSampler, input.uv);
  return texColor * input.color;
}
`;