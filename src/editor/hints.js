/**
 * Управление подсказками.
 *
 * enabled — глобальная настройка пользователя (localStorage), действует
 *           на все проекты. Отключается во вкладке «Проект» → «Помощь».
 *
 * shown   — метаданные проекта: какие подсказки уже показывались именно
 *           в этом проекте. Сбрасываются при создании нового проекта,
 *           при открытии .pride, но сохраняются между сессиями.
 *           В историю undo/redo НЕ входят.
 *
 * Персистенция: модуль не знает про storage. Когда подсказка показана
 * впервые, вызывается зарегистрированный saveCallback (обычно —
 * scheduleSave из main.js), который отложенно сохранит проект.
 */

const ENABLED_KEY = 'pride.hints.enabled.v1';

let saveCallback = null;

/**
 * Регистрирует колбэк, вызываемый после того, как showHintOnce()
 * пометил новую подсказку как показанную. Нужен, чтобы hintsShown
 * попал в следующий autosave.
 */
export function setHintsSaveCallback(fn) {
  saveCallback = typeof fn === 'function' ? fn : null;
}

export function hintsEnabled() {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setHintsEnabled(enabled) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Показывает подсказку один раз на проект.
 * @param {object} project — должен иметь поле hintsShown (объект).
 * @param {string} key
 * @param {Function} fn
 * @returns {boolean} — true, если подсказка была показана.
 */
export function showHintOnce(project, key, fn) {
  if (!hintsEnabled()) return false;
  if (!project.hintsShown) project.hintsShown = {};
  if (project.hintsShown[key]) return false;
  project.hintsShown[key] = true;
  fn();
  if (saveCallback) {
    try { saveCallback(); } catch { /* swallow */ }
  }
  return true;
}