/**
 * Управление темой редактора.
 *
 * Темы: 'dark' (по умолчанию) и 'light'.
 * Хранится в localStorage, применяется через атрибут
 * data-theme на <html>. CSS-переменные переключаются автоматически.
 *
 * Ранняя инициализация (до отрисовки) делается inline-скриптом
 * в <head> index.html, чтобы не было вспышки тёмной темы.
 */

const KEY = 'pride.theme.v1';

export const THEMES = ['dark', 'light'];

export function getTheme() {
  const t = localStorage.getItem(KEY);
  return THEMES.includes(t) ? t : 'dark';
}

export function setTheme(name) {
  if (!THEMES.includes(name)) return;
  localStorage.setItem(KEY, name);
  document.documentElement.setAttribute('data-theme', name);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Синхронизирует атрибут с localStorage. Зовётся из main() на всякий случай. */
export function initTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
}