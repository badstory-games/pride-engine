export class ShortcutsModal {
  constructor() {
    this.el = document.getElementById('shortcuts-modal');
    this.closeBtn = this.el.querySelector('.modal-close');

    this.closeBtn.addEventListener('click', () => this.close());
    this.el.addEventListener('mousedown', (e) => {
      // клик по фону (не по содержимому) — закрыть
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