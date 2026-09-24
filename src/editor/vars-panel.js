export class VarsPanel {
  constructor(container, project) {
    this.container = container;
    this.project = project;
    this.onChange = () => {};
    this.running = false;

    container.innerHTML = `
      <header class="vars-header">
        <h3>Global variables</h3>
        <button class="topbtn" data-action="add">+ Add</button>
      </header>
      <div class="vars-list"></div>
    `;
    this.listEl = container.querySelector('.vars-list');

    container.addEventListener('click', (e) => this._onClick(e));
    container.addEventListener('input', (e) => this._onInput(e));
    container.addEventListener('change', (e) => this._onInput(e));
  }

  setRunning(running) {
    if (this.running === running) return;
    this.running = running;
    this.refresh();
  }

  refresh() {
    this._render();
  }

  /** Обновляет только колонку Current — вызывается часто во время Play. */
  updateCurrent() {
    if (!this.running) return;
    const vars = this.project.vars || {};
    const rows = this.listEl.querySelectorAll('.vars-row:not(.vars-row-head)');
    for (const row of rows) {
      const name = row.dataset.name;
      const cur = row.querySelector('.vars-current');
      if (cur) {
        const v = vars[name] ?? '—';
        if (cur.textContent !== String(v)) cur.textContent = v;
      }
    }
  }

  _render() {
    const initial = this.project.varsInitial || (this.project.varsInitial = {});
    const current = this.project.vars        || (this.project.vars        = {});
    const names = Object.keys(initial);
    this.listEl.innerHTML = '';

    // Шапка
    const head = document.createElement('div');
    head.className = 'vars-row vars-row-head';
    head.innerHTML = `
      <span>Name</span>
      <span>Initial</span>
      <span>Current</span>
      <span></span>
    `;
    this.listEl.appendChild(head);

    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'vars-empty';
      empty.textContent = 'No variables. Add one.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const name of names) {
      const row = document.createElement('div');
      row.className = 'vars-row';
      row.dataset.name = name;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'vars-name';
      nameInput.value = name;
      nameInput.placeholder = 'name';

      const initialInput = document.createElement('input');
      initialInput.type = 'number';
      initialInput.className = 'vars-initial';
      initialInput.value = initial[name] ?? 0;
      initialInput.step = 'any';

      const currentSpan = document.createElement('span');
      currentSpan.className = 'vars-current';
      currentSpan.textContent = current[name] ?? initial[name] ?? 0;

      const del = document.createElement('button');
      del.className = 'vars-del';
      del.title = 'Удалить';
      del.textContent = '✕';

      row.append(nameInput, initialInput, currentSpan, del);
      this.listEl.appendChild(row);
    }
  }

  _onClick(e) {
    const add = e.target.closest('[data-action="add"]');
    if (add) {
      let n = 1;
      while (this.project.varsInitial['var' + n] !== undefined) n++;
      this.project.varsInitial['var' + n] = 0;
      this.project.vars['var' + n] = 0;
      this.refresh();
      this.onChange();
      return;
    }

    const del = e.target.closest('.vars-del');
    if (del) {
      const row = del.closest('.vars-row');
      const name = row.dataset.name;
      delete this.project.varsInitial[name];
      delete this.project.vars[name];
      this.refresh();
      this.onChange();
    }
  }

  _onInput(e) {
    const row = e.target.closest('.vars-row');
    if (!row || row.classList.contains('vars-row-head')) return;
    const oldName = row.dataset.name;

    // --- Переименование ---
    if (e.target.classList.contains('vars-name')) {
      const newName = (e.target.value || '').trim() || 'unnamed';
      if (newName === oldName) return;

      if (this.project.varsInitial[newName] !== undefined) {
        e.target.value = oldName;
        return;
      }

      this.project.varsInitial[newName] = this.project.varsInitial[oldName];
      this.project.vars[newName]        = this.project.vars[oldName];
      delete this.project.varsInitial[oldName];
      delete this.project.vars[oldName];

      row.dataset.name = newName;
      this.onChange();
      return;
    }

    // --- Initial value ---
    if (e.target.classList.contains('vars-initial')) {
      const n = parseFloat(e.target.value);
      if (!Number.isFinite(n)) return;

      this.project.varsInitial[oldName] = n;

      // Вне Play — сразу применяем к Current
      if (!this.running) {
        this.project.vars[oldName] = n;
        const cur = row.querySelector('.vars-current');
        if (cur) cur.textContent = n;
      }

      this.onChange();
    }
  }
}