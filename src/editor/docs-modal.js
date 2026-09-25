import { renderMarkdown } from './markdown.js';
import { DOCS, buildRefDocs } from './docs-content.js';
import { icon } from './icons.js';

/**
 * Модалка встроенной документации.
 *
 * - Открывается кнопкой в topbar или F2.
 * - Слева — список статей по категориям + поиск.
 * - Справа — отрендеренный markdown.
 * - Справочник условий / действий генерируется из registry при открытии —
 *   изменения в реестре сразу видны в документации.
 */
export class DocsModal {
  constructor() {
    this._el = null;
    this._onKey = this._onKey.bind(this);
    this._docs = [];
    this._activeId = null;

    this._listEl = null;
    this._contentEl = null;
    this._searchEl = null;
  }

  open() {
    if (this._el) return;
    this._build();
    document.addEventListener('keydown', this._onKey, true);
  }

  close() {
    if (!this._el) return;
    document.removeEventListener('keydown', this._onKey, true);
    this._el.remove();
    this._el = null;
    this._listEl = null;
    this._contentEl = null;
    this._searchEl = null;
    this._activeId = null;
  }

  toggle() {
    if (this._el) this.close();
    else this.open();
  }

  get isOpen() {
    return this._el !== null;
  }

  _onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  _build() {
    // Базовые статьи + свежий автогенерируемый справочник.
    this._docs = [...DOCS, ...buildRefDocs()];

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop docs-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const box = document.createElement('div');
    box.className = 'docs-box';

    // ---------- Header ----------
    const header = document.createElement('div');
    header.className = 'docs-header';
    header.innerHTML = `
      <h2 class="docs-title">${icon('book')}<span>Документация</span></h2>
      <button class="modal-close docs-close" title="Закрыть (Esc)">${icon('x')}</button>
    `;
    box.appendChild(header);

    // ---------- Body ----------
    const body = document.createElement('div');
    body.className = 'docs-body';

    const sidebar = document.createElement('aside');
    sidebar.className = 'docs-sidebar';

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'docs-search';
    search.placeholder = 'Поиск…';
    search.autocomplete = 'off';
    search.spellcheck = false;
    sidebar.appendChild(search);

    const list = document.createElement('div');
    list.className = 'docs-list';
    sidebar.appendChild(list);

    const content = document.createElement('div');
    content.className = 'docs-content';

    body.appendChild(sidebar);
    body.appendChild(content);
    box.appendChild(body);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this._el = backdrop;
    this._listEl = list;
    this._contentEl = content;
    this._searchEl = search;

    // ---------- Events ----------
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this.close();
    });

    header.querySelector('.docs-close')
      .addEventListener('click', () => this.close());

    search.addEventListener('input', () => this._renderList(search.value));

    list.addEventListener('click', (e) => {
      const item = e.target.closest('[data-doc-id]');
      if (!item) return;
      this._select(item.dataset.docId);
    });

    // ---------- Initial render ----------
    this._renderList('');

    // Открываем первую статью по умолчанию.
    if (this._docs.length) this._select(this._docs[0].id);

    requestAnimationFrame(() => search.focus());
  }

  _renderList(query) {
    const q = String(query || '').trim().toLowerCase();
    const list = this._listEl;
    list.innerHTML = '';

    // Фильтр: по заголовку или содержимому.
    const matched = this._docs.filter((d) => {
      if (!q) return true;
      if (d.title.toLowerCase().includes(q)) return true;
      if (d.content.toLowerCase().includes(q)) return true;
      return false;
    });

    if (matched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'docs-empty';
      empty.textContent = 'Ничего не найдено.';
      list.appendChild(empty);
      return;
    }

    // Группировка по категориям.
    const groups = new Map();
    for (const d of matched) {
      const cat = d.category || 'Прочее';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(d);
    }

    for (const [cat, items] of groups) {
      const catEl = document.createElement('div');
      catEl.className = 'docs-cat';
      catEl.textContent = cat;
      list.appendChild(catEl);

      for (const d of items) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'docs-item';
        if (d.id === this._activeId) el.classList.add('active');
        el.dataset.docId = d.id;
        el.textContent = d.title;
        list.appendChild(el);
      }
    }
  }

  _select(id) {
    const doc = this._docs.find((d) => d.id === id);
    if (!doc) return;

    this._activeId = id;

    for (const el of this._listEl.querySelectorAll('.docs-item')) {
      el.classList.toggle('active', el.dataset.docId === id);
    }

    this._contentEl.innerHTML = renderMarkdown(doc.content);
    this._contentEl.scrollTop = 0;

    // Прокручиваем список к активному элементу, если он вне видимости.
    const activeEl = this._listEl.querySelector(
      `.docs-item[data-doc-id="${id}"]`
    );
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }
}