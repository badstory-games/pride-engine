/**
 * Работа с иконкой проекта.
 *
 *   project.icon — либо null (используется фирменный логотип Pride
 *   Engine), либо строка dataURL с маленькой копией выбранной
 *   текстуры (64×64 PNG).
 *
 * Хранение именно dataURL, а не assetId, решает главную проблему:
 * менеджер проектов должен показывать иконки всех проектов сразу,
 * а ассеты каждого проекта лежат в своём scope и недоступны без
 * переключения. Маленькая встроенная копия делает карточку
 * самодостаточной.
 */

export const ICON_THUMB_SIZE = 64;

/**
 * Встроенный логотип Pride Engine — та же графика, что и в брендинге
 * редактора (шапка). Отдаётся как готовая SVG-разметка, а не через
 * хелпер icon(), потому что у символа особые атрибуты обводки.
 */
export function defaultProjectIconHtml(extraClass = '') {
  const cls = extraClass ? `project-icon ${extraClass}` : 'project-icon';
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M 25 16 V 48 M 25 16 H 33 A 8 8 0 0 1 33 32 H 25"
          stroke="currentColor" stroke-width="6"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="25" cy="16" r="5" fill="currentColor"/>
    <circle cx="25" cy="48" r="5" fill="currentColor"/>
    <circle cx="43" cy="24" r="5" fill="#e6a540"/>
  </svg>`;
}

/**
 * Возвращает HTML иконки:
 *   - <img src="data:..."> если задана пользовательская иконка;
 *   - встроенный SVG-логотип, если icon отсутствует.
 *
 * @param {string|null|undefined} dataUrl
 * @param {string} [extraClass]
 */
export function projectIconHtml(dataUrl, extraClass = '') {
  const cls = extraClass ? `project-icon ${extraClass}` : 'project-icon';
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    return `<img class="${cls}" src="${escapeAttr(dataUrl)}" alt="" draggable="false">`;
  }
  return defaultProjectIconHtml(extraClass);
}

/** Проверяет, что значение похоже на валидную dataURL-иконку. */
export function isProjectIconDataUrl(v) {
  return typeof v === 'string' && v.startsWith('data:image/');
}

/**
 * Создаёт уменьшенную копию картинки (dataURL PNG) для иконки.
 * Вписывает картинку в квадрат size×size с сохранением пропорций,
 * центрируя её. Если исходник меньше — не растягивает.
 *
 * Возвращает dataURL или null при ошибке.
 */
export async function makeIconDataUrl(blob, size = ICON_THUMB_SIZE) {
  if (!blob) return null;
  let bmp = null;
  try {
    bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const scale = Math.min(size / bmp.width, size / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const x = Math.round((size - w) / 2);
    const y = Math.round((size - h) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, x, y, w, h);

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[project-icon] thumbnail failed:', e);
    return null;
  } finally {
    try { bmp && bmp.close && bmp.close(); } catch {}
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}