/**
 * Шаблоны проектов.
 *
 * create() возвращает { scene, sheet, varsInitial, gravityX, gravityY }.
 * gravity по умолчанию 980 (вниз) — как в PhysicsBridge.
 */

const DEFAULT_PHYS = {
  enabled: true,
  type: 'dynamic',
  shape: 'box',
  density: 1,
  friction: 0.5,
  restitution: 0.2,
  radius: 32,
};

const STATIC_PHYS = {
  enabled: true,
  type: 'static',
  shape: 'box',
  density: 1,
  friction: 0.7,
  restitution: 0.05,
  radius: 32,
};

const DYNAMIC_OBJ = (over) => ({
  type: 'sprite',
  name: 'Object',
  x: 0, y: 0, width: 64, height: 64,
  rotation: 0,
  opacity: 1,
  layerId: 'default',
  textureId: 'player',
  visible: true,
  properties: {},
  physics: { ...DEFAULT_PHYS },
  ...over,
});

const STATIC_OBJ = (over) => ({
  type: 'sprite',
  name: 'Ground',
  x: 0, y: 0, width: 64, height: 24,
  rotation: 0,
  opacity: 1,
  layerId: 'default',
  textureId: '__white',
  visible: true,
  properties: {},
  physics: { ...STATIC_PHYS },
  ...over,
});

function makeScene(layers, objects) {
  let nextId = 1;
  const withIds = objects.map((o) => ({ ...o, id: nextId++ }));
  return {
    objects: withIds,
    layers,
    nextId,
    nextLayerId: layers.length + 1,
  };
}

const DEFAULT_LAYERS = [
  { id: 'default', name: 'Слой 1', visible: true },
];

// ------------------------------------------------------------
// Empty
// ------------------------------------------------------------

function emptyTemplate() {
  return {
    scene: makeScene(DEFAULT_LAYERS, [
      STATIC_OBJ({
        name: 'Ground',
        x: 256, y: 400, width: 512, height: 32,
      }),
      DYNAMIC_OBJ({
        name: 'Player',
        x: 300, y: 200, width: 48, height: 48,
      }),
    ]),
    sheet: {
      name: 'EventSheet 1',
      events: [
        {
          id: 1,
          conditions: [{ type: 'OnKeyPressed', params: { key: 'Space' } }],
          actions: [{
            type: 'ApplyImpulse',
            params: { target: 'Player', ix: 0, iy: -800 },
          }],
          children: [],
          disabled: false,
        },
      ],
    },
    varsInitial: {},
    gravityX: 0,
    gravityY: 980,
  };
}

// ------------------------------------------------------------
// Platformer
// ------------------------------------------------------------

function platformerTemplate() {
  const layers = [
    { id: 'bg', name: 'Background', visible: true },
    { id: 'default', name: 'Main', visible: true },
  ];

  return {
    scene: makeScene(layers, [
      STATIC_OBJ({
        name: 'BgStrip',
        layerId: 'bg',
        x: 0, y: 0, width: 1024, height: 640,
        textureId: '__white',
        physics: { ...STATIC_PHYS, enabled: false },
        opacity: 0.15,
      }),

      STATIC_OBJ({ name: 'Ground', x: 0, y: 560, width: 1024, height: 80 }),
      STATIC_OBJ({ name: 'Platform', x: 150, y: 460, width: 200, height: 24 }),
      STATIC_OBJ({ name: 'Platform', x: 440, y: 380, width: 160, height: 24 }),
      STATIC_OBJ({ name: 'Platform', x: 700, y: 300, width: 200, height: 24 }),
      STATIC_OBJ({ name: 'Platform', x: 320, y: 220, width: 140, height: 24 }),

      DYNAMIC_OBJ({
        name: 'Player',
        x: 60, y: 480, width: 48, height: 48,
        physics: { ...DEFAULT_PHYS, friction: 0.2, restitution: 0.0 },
      }),

      DYNAMIC_OBJ({
        name: 'Crate',
        x: 850, y: 100, width: 40, height: 40,
      }),
    ]),

    sheet: {
      name: 'EventSheet 1',
      events: [
        {
          id: 1,
          conditions: [{ type: 'OnKeyPressed', params: { key: 'Space' } }],
          actions: [{
            type: 'ApplyImpulse',
            params: { target: 'Player', ix: 0, iy: -900 },
          }],
          children: [],
          disabled: false,
        },
        {
          id: 2,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyA' } }],
          actions: [{
            type: 'SetVelocity',
            params: { target: 'Player', vx: -260, vy: 0 },
          }],
          children: [],
          disabled: false,
        },
        {
          id: 3,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyD' } }],
          actions: [{
            type: 'SetVelocity',
            params: { target: 'Player', vx: 260, vy: 0 },
          }],
          children: [],
          disabled: false,
        },
      ],
    },
    varsInitial: {},
    gravityX: 0,
    gravityY: 980,
  };
}

// ------------------------------------------------------------
// Top-down — гравитация выключена.
// ------------------------------------------------------------

function topDownTemplate() {
  const wallThickness = 24;
  const W = 1024;
  const H = 640;

  return {
    scene: makeScene(DEFAULT_LAYERS, [
      STATIC_OBJ({ name: 'Wall', x: 0, y: 0, width: W, height: wallThickness }),
      STATIC_OBJ({ name: 'Wall', x: 0, y: H - wallThickness, width: W, height: wallThickness }),
      STATIC_OBJ({ name: 'Wall', x: 0, y: 0, width: wallThickness, height: H }),
      STATIC_OBJ({ name: 'Wall', x: W - wallThickness, y: 0, width: wallThickness, height: H }),

      STATIC_OBJ({ name: 'Block', x: 200, y: 200, width: 80, height: 80 }),
      STATIC_OBJ({ name: 'Block', x: 500, y: 380, width: 120, height: 60 }),
      STATIC_OBJ({ name: 'Block', x: 740, y: 180, width: 60, height: 120 }),

      DYNAMIC_OBJ({
        name: 'Player',
        x: 480, y: 300, width: 32, height: 32,
        physics: { ...DEFAULT_PHYS, friction: 0.3 },
      }),
    ]),

    sheet: {
      name: 'EventSheet 1',
      events: [
        {
          id: 1,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyW' } }],
          actions: [{ type: 'SetVelocity', params: { target: 'Player', vx: 0, vy: -220 } }],
          children: [], disabled: false,
        },
        {
          id: 2,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyS' } }],
          actions: [{ type: 'SetVelocity', params: { target: 'Player', vx: 0, vy: 220 } }],
          children: [], disabled: false,
        },
        {
          id: 3,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyA' } }],
          actions: [{ type: 'SetVelocity', params: { target: 'Player', vx: -220, vy: 0 } }],
          children: [], disabled: false,
        },
        {
          id: 4,
          conditions: [{ type: 'IsKeyDown', params: { key: 'KeyD' } }],
          actions: [{ type: 'SetVelocity', params: { target: 'Player', vx: 220, vy: 0 } }],
          children: [], disabled: false,
        },
      ],
    },
    varsInitial: {},
    gravityX: 0,
    gravityY: 0,
  };
}

// ------------------------------------------------------------
// Реестр
// ------------------------------------------------------------

export const TEMPLATES = [
  {
    id: 'empty',
    name: 'Пустой',
    description: 'Земля и один игрок. Простой старт без лишнего.',
    icon: 'file-plus',
    create: emptyTemplate,
  },
  {
    id: 'platformer',
    name: 'Платформер',
    description: 'Платформы, прыжок (Space), движение (A / D), падающий ящик.',
    icon: 'square',
    create: platformerTemplate,
  },
  {
    id: 'topdown',
    name: 'Вид сверху',
    description: 'Комната со стенами, движение по WASD, гравитация выключена.',
    icon: 'crosshair',
    create: topDownTemplate,
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}