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

    // Кэши, живущие весь сеанс рендерера.
    this._bgl = null;
    this._bindGroupCache = new Map();   // GPUTexture → GPUBindGroup
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
        buffers: [{
          arrayStride: 8 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0,  format: 'float32x2' },
            { shaderLocation: 1, offset: 8,  format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32x4' },
          ],
        }],
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

  // Матрица проекции пишется извне через camera.writeMatrix(m, W, H),
  // затем вызывающий код сам делает writeBuffer. Renderer её не трогает.

  setTexture(texture, sampler) {
    this.texture = texture;
    this.sampler = sampler || this.sampler;

    // Один bind group на текстуру за всё время жизни рендерера.
    // uniformBuffer стабилен, sampler стабилен, view текстуры стабилен.
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
        clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
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
  @location(0) position: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = uniforms.projection * vec4<f32>(input.position, 0.0, 1.0);
  output.uv = input.uv;
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let texColor = textureSample(tex, texSampler, input.uv);
  return texColor * input.color;
}
`;