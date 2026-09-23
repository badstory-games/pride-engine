export class Scene {
  constructor() {
    this.objects = [];
    this.nextId = 1;
  }

  add(partial) {
    const obj = {
      id: this.nextId++,
      type: 'sprite',
      x: 0, y: 0,
      width: 64, height: 64,
      rotation: 0,
      opacity: 1,
      layer: 0,
      textureId: null,
      visible: true,
      properties: {},
      ...partial,
    };
    this.objects.push(obj);
    return obj;
  }

  remove(id) {
    const i = this.objects.findIndex(o => o.id === id);
    if (i >= 0) this.objects.splice(i, 1);
  }

  get(id) {
    return this.objects.find(o => o.id === id) || null;
  }

  /** Отсортировано по layer, затем по порядку добавления. */
  getSortedByLayer() {
    const arr = this.objects
      .map((o, i) => ({ o, i }))
      .filter(e => e.o.visible);
    arr.sort((a, b) => (a.o.layer - b.o.layer) || (a.i - b.i));
    return arr.map(e => e.o);
  }

  /** Центр объекта в мировых координатах (с учётом будущего pivot). */
  centerOf(obj) {
    return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
  }
}