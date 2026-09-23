/**
 * Трекер клавиатуры с edge-triggered семантикой.
 *   down     — клавиша сейчас зажата
 *   pressed  — клавиша была нажата в этом кадре (rising edge)
 *   released — клавиша была отпущена в этом кадре (falling edge)
 *
 * endFrame() вызывается после каждого fixed-step'а update(),
 * чтобы второй подшаг в том же rAF не увидел edge повторно.
 */
export class InputState {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
  }

  press(code) {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  release(code) {
    this.down.delete(code);
    this.released.add(code);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
}