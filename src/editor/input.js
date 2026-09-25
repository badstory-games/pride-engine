import { pickTopmost, objectsInRect } from './hit-test.js';

const DEFAULT_TEXTURE = '__white';

export class EditorController {
  constructor(canvas, camera, editor) {
    this.canvas = canvas;
    this.camera = camera;
    this.editor = editor;

    this.mouseWorld = { x: 0, y: 0 };
    this.mouseScreen = { x: 0, y: 0 };
    this.panning = false;
    this._panStart = null;

    this.onToggleShortcuts = null;
    this.isShortcutsOpen = null;

    this._bind();
  }

  _eventScreen(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top)  * (this.canvas.height / r.height),
    };
  }

  _screenToWorld(sx, sy) {
    return this.camera.screenToWorld(sx, sy, this.canvas.width, this.canvas.height);
  }

  _cursorForTool() {
    if (this.panning) return 'grabbing';
    return this.editor.tool === 'select' ? 'default' : 'crosshair';
  }

  setTool(t) {
    this.editor.tool = t;
    this.editor.drag = null;
    this.editor.box = null;
    this.editor.pendingRect = null;
    this.canvas.style.cursor = this._cursorForTool();
    this.editor.onChange();
  }

  _history() { return this.editor.history; }

  _bind() {
    const c = this.canvas;
    const ed = this.editor;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // ------------- MOUSEDOWN -------------
    c.addEventListener('mousedown', (e) => {
      const s = this._eventScreen(e);
      const w = this._screenToWorld(s.x, s.y);
      this.mouseScreen = s;
      this.mouseWorld = w;

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        this.panning = true;
        this._panStart = { sx: s.x, sy: s.y, cx: this.camera.x, cy: this.camera.y };
        c.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;
      if (ed.locked) return;

      const shift = e.shiftKey;

      if (ed.tool === 'select') {
        const hit = pickTopmost(ed.scene, w.x, w.y);

        if (hit) {
          if (shift) ed.select(hit.id, true);
          else if (!ed.selection.has(hit.id)) ed.select(hit.id, false);

          if (ed.selection.has(hit.id)) {
            const originals = new Map();
            for (const id of ed.selection) {
              const o = ed.scene.get(id);
              if (o) originals.set(id, { x: o.x, y: o.y });
            }
            ed.drag = { startWorld: w, originals };

            const h = this._history();
            if (h) h.begin('Move');
          }
        } else {
          if (!shift) ed.clearSelection();
          ed.box = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, additive: shift };
        }
      } else if (ed.tool === 'rectangle') {
        ed.pendingRect = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      } else if (ed.tool === 'sprite') {
        const h = this._history();
        const create = () => {
          const obj = ed.scene.add({
            x: w.x - 32, y: w.y - 32,
            width: 64, height: 64,
            textureId: DEFAULT_TEXTURE,
          });
          ed.select(obj.id, false);
        };
        if (h) h.run('Create sprite', create); else create();
        ed.onChange();
      }
    });

    // ------------- MOUSEMOVE -------------
    window.addEventListener('mousemove', (e) => {
      const s = this._eventScreen(e);
      const w = this._screenToWorld(s.x, s.y);
      this.mouseScreen = s;
      this.mouseWorld = w;

      if (this.panning) {
        const dx = s.x - this._panStart.sx;
        const dy = s.y - this._panStart.sy;
        this.camera.x = this._panStart.cx - dx / this.camera.zoom;
        this.camera.y = this._panStart.cy - dy / this.camera.zoom;
        return;
      }

      if (ed.drag) {
        const dx = w.x - ed.drag.startWorld.x;
        const dy = w.y - ed.drag.startWorld.y;
        for (const [id, orig] of ed.drag.originals) {
          const o = ed.scene.get(id);
          if (!o) continue;
          o.x = orig.x + dx;
          o.y = orig.y + dy;
        }
        ed.onChange();
      } else if (ed.box) {
        ed.box.x1 = w.x;
        ed.box.y1 = w.y;
      } else if (ed.pendingRect) {
        ed.pendingRect.x1 = w.x;
        ed.pendingRect.y1 = w.y;
      } else if (ed.tool === 'select') {
        const hit = pickTopmost(ed.scene, w.x, w.y);
        ed.hovered = hit ? hit.id : null;
      } else {
        ed.hovered = null;
      }
    });

    // ------------- MOUSEUP -------------
    window.addEventListener('mouseup', (e) => {
      if (this.panning) {
        this.panning = false;
        c.style.cursor = this._cursorForTool();
        return;
      }

      const s = this._eventScreen(e);
      const w = this._screenToWorld(s.x, s.y);

      if (ed.drag) {
        ed.drag = null;
        const h = this._history();
        if (h) h.commit();
        ed.onChange();
      } else if (ed.box) {
        const objs = objectsInRect(ed.scene, ed.box.x0, ed.box.y0, ed.box.x1, ed.box.y1);
        ed.selectMany(objs.map((o) => o.id), ed.box.additive);
        ed.box = null;
      } else if (ed.pendingRect) {
        const x0 = Math.min(ed.pendingRect.x0, ed.pendingRect.x1);
        const y0 = Math.min(ed.pendingRect.y0, ed.pendingRect.y1);
        const x1 = Math.max(ed.pendingRect.x0, ed.pendingRect.x1);
        const y1 = Math.max(ed.pendingRect.y0, ed.pendingRect.y1);
        const rw = x1 - x0;
        const rh = y1 - y0;
        if (rw > 2 && rh > 2) {
          const h = this._history();
          const create = () => {
            const obj = ed.scene.add({
              x: x0, y: y0,
              width: rw, height: rh,
              textureId: DEFAULT_TEXTURE,
            });
            ed.select(obj.id, false);
          };
          if (h) h.run('Create rect', create); else create();
          ed.onChange();
        }
        ed.pendingRect = null;
      }
    });

    // ------------- WHEEL -------------
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s = this._eventScreen(e);
      this.camera.zoomAt(s.x, s.y, e.deltaY, c.width, c.height);
    }, { passive: false });

    c.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });

    // ------------- KEYDOWN -------------
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        if (this.onToggleShortcuts) this.onToggleShortcuts();
        return;
      }

      if (e.code === 'Escape' && this.isShortcutsOpen && this.isShortcutsOpen()) {
        e.preventDefault();
        if (this.onToggleShortcuts) this.onToggleShortcuts();
        return;
      }

      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (ed.locked) return;
        if (ed.selection.size) {
          ed.deleteSelected();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (e.code === 'Escape') {
        const h = ed.history;
        if (h && h.pending) h.rollback();

        ed.clearSelection();
        ed.box = null;
        ed.pendingRect = null;
        ed.drag = null;
        return;
      }

      if (mod && e.code === 'KeyA') {
        if (ed.locked) return;
        ed.selectMany(ed.scene.objects.map((o) => o.id), false);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (mod) return;
      if (ed.locked) return;

      if (e.code === 'Digit1' || e.code === 'KeyQ')      this.setTool('select');
      else if (e.code === 'Digit2' || e.code === 'KeyR') this.setTool('rectangle');
      else if (e.code === 'Digit3' || e.code === 'KeyS') this.setTool('sprite');
    });
  }
}