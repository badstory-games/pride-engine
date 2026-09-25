/**
 * Минимальный markdown-рендерер без зависимостей.
 *
 * Поддерживает:
 *   - заголовки # ## ### #### (до h6)
 *   - абзацы
 *   - **bold**, *italic*, `code`
 *   - fenced code blocks (``` ... ```)
 *   - списки: - и 1.
 *   - горизонтальные линии ---
 *   - ссылки [text](url)
 *
 * Не претендует на полный CommonMark — покрывает нужды встроенной справки.
 * Весь вход экранируется, HTML в содержимом не выполняется.
 */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Обрабатывает инлайн-разметку. Сначала выделяет `code`-фрагменты в
 * отдельные части, чтобы * и ** внутри них не превратились в теги,
 * потом в остальном тексте применяет bold/italic/link.
 */
function inline(text) {
  const parts = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'code', value: m[1] });
    last = m.index + m[0].length;
  }
  parts.push({ type: 'text', value: text.slice(last) });

  return parts.map((p) => {
    if (p.type === 'code') return `<code>${p.value}</code>`;

    let s = p.value;
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    return s;
  }).join('');
}

export function renderMarkdown(src) {
  const lines = String(src).split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ---------- Fenced code block ----------
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      i++; // закрывающий ```
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // ---------- Heading ----------
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(escapeHtml(h[2]))}</h${level}>`);
      i++;
      continue;
    }

    // ---------- Horizontal rule ----------
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // ---------- Unordered list ----------
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(
        '<ul>' +
        items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join('') +
        '</ul>'
      );
      continue;
    }

    // ---------- Ordered list ----------
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(
        '<ol>' +
        items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join('') +
        '</ol>'
      );
      continue;
    }

    // ---------- Blank line ----------
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ---------- Paragraph ----------
    // Собираем строки, пока не встретим пустую или начало другого блока.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      out.push('<p>' + inline(escapeHtml(para.join(' '))) + '</p>');
    }
  }

  return out.join('\n');
}