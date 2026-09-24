import { icon } from './icons.js';

export class ShortcutsModal {
  constructor() {
    this.el = document.getElementById('shortcuts-modal');
    this.closeBtn = this.el.querySelector('.modal-close');
    if (this.closeBtn) this.closeBtn.innerHTML = icon('x');

    this.closeBtn.addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  open() {
    this.el.hidden = false;
  }

  close() {
    this.el.hidden = true;
  }

  toggle() {
    if (this.el.hidden) this.open();
    else this.close();
  }

  get isOpen() {
    return !this.el.hidden;
  }
}