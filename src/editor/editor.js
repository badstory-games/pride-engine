export class Editor {
  constructor(scene) {
    this.scene = scene;
    this.selection = new Set();   // Set<id>
    this.tool = 'select';         // 'select' | 'rectangle' | 'sprite'
    this.drag = null;             // { startWorld, originals: Map<id, {x,y}> }
    this.box = null;              // { x0, y0, x1, y1, additive }
    this.pendingRect = null;      // { x0, y0, x1, y1 }
    this.hovered = null;          // id | null
    this.onChange = () => {};
  }

  clearSelection() {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.onChange();
  }

  select(id, additive = false) {
    if (additive) {
      if (this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
    } else {
      this.selection.clear();
      this.selection.add(id);
    }
    this.onChange();
  }

  selectMany(ids, additive = false) {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.onChange();
  }

  isSelected(id) {
    return this.selection.has(id);
  }

  deleteSelected() {
    if (this.selection.size === 0) return;
    for (const id of [...this.selection]) this.scene.remove(id);
    this.selection.clear();
    this.hovered = null;
    this.onChange();
  }
}