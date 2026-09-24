/**
 * Копирование / вставка / дублирование объектов сцены.
 *
 * Хранит внутренний буфер сериализованных объектов (без id).
 * При вставке генерирует новые id, копирует physics/properties,
 * смещает объекты нарастающим шагом и выделяет их.
 *
 * Использование:
 *   const clip = new Clipboard();
 *   clip.copy(editor, scene);         // Ctrl+C
 *   clip.cut(editor, scene);          // Ctrl+X
 *   clip.paste(editor, scene);        // Ctrl+V
 *   clip.duplicate(editor, scene);    // Ctrl+D
 */
export class Clipboard {
  constructor() {
    /** @type {object[]} — снапшоты объектов без id. */
    this._buffer = [];
    /** Смещение следующей вставки, px. Растёт с каждой paste. */
    this._pasteOffset = 0;
    /** Чтобы не смещать слишком сильно при длинной серии. */
    this._maxOffset = 16 * 8;
  }

  get isEmpty() {
    return this._buffer.length === 0;
  }

  // ============================================================
  // copy / cut
  // ============================================================

  copy(editor, scene) {
    if (editor.selection.size === 0) return false;

    this._buffer.length = 0;
    for (const id of editor.selection) {
      const obj = scene.get(id);
      if (!obj) continue;
      this._buffer.push(this._serialize(obj));
    }
    this._pasteOffset = 0;
    return this._buffer.length > 0;
  }

  cut(editor, scene) {
    if (!this.copy(editor, scene)) return false;
    editor.deleteSelected();
    return true;
  }

  // ============================================================
  // paste / duplicate
  // ============================================================

  paste(editor, scene) {
    if (this._buffer.length === 0) return false;

    this._pasteOffset = Math.min(
      this._pasteOffset + 16,
      this._maxOffset
    );

    const h = editor.history;
    const apply = () => this._applyPaste(editor, scene);
    if (h) h.run('Paste', apply); else apply();

    editor.onChange();
    return true;
  }

  duplicate(editor, scene) {
    if (editor.selection.size === 0) return false;

    // Дублирование = copy + paste в одной транзакции,
    // не трогая системный буфер (если пользователь что-то в нём держал).
    const tmp = new Clipboard();
    tmp.copy(editor, scene);
    tmp._pasteOffset = 16;

    const h = editor.history;
    const apply = () => tmp._applyPaste(editor, scene);
    if (h) h.run('Duplicate', apply); else apply();

    editor.onChange();
    return true;
  }

  // ============================================================
  // internal
  // ============================================================

  _applyPaste(editor, scene) {
    const dx = this._pasteOffset;
    const dy = this._pasteOffset;

    // Падение на слой по умолчанию, если исходный удалён.
    const layerExists = (id) => scene.getLayer(id) !== null;

    const newIds = [];
    for (const src of this._buffer) {
      const layerId = layerExists(src.layerId)
        ? src.layerId
        : scene.layers[0].id;

      const obj = scene.add({
        type: src.type,
        name: src.name,
        x: src.x + dx,
        y: src.y + dy,
        width: src.width,
        height: src.height,
        rotation: src.rotation,
        opacity: src.opacity,
        layerId,
        textureId: src.textureId,
        visible: src.visible,
        properties: structuredClone(src.properties || {}),
        physics: structuredClone(src.physics),
      });
      newIds.push(obj.id);
    }

    // После paste выделение — вставленные объекты.
    editor.selection.clear();
    for (const id of newIds) editor.selection.add(id);
    editor.hovered = null;
  }

  /** Снапшот одного объекта: все поля, кроме id. */
  _serialize(obj) {
    return {
      type:      obj.type,
      name:      obj.name,
      x:         obj.x,
      y:         obj.y,
      width:     obj.width,
      height:    obj.height,
      rotation:  obj.rotation,
      opacity:   obj.opacity,
      layerId:   obj.layerId,
      textureId: obj.textureId,
      visible:   obj.visible,
      properties: structuredClone(obj.properties || {}),
      physics:    structuredClone(obj.physics),
    };
  }
}