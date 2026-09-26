/**
 * Inline SVG-спрайт иконок (Lucide/Feather-style, MIT).
 */

const SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <symbol id="icon-cursor" viewBox="0 0 24 24">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
  </symbol>
  <symbol id="icon-square" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
  </symbol>
  <symbol id="icon-image" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="9" cy="9" r="2"/>
    <path d="M21 15l-5-5L5 21"/>
  </symbol>
  <symbol id="icon-plus" viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </symbol>
  <symbol id="icon-x" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </symbol>
  <symbol id="icon-chevron-up" viewBox="0 0 24 24">
    <polyline points="18 15 12 9 6 15"/>
  </symbol>
  <symbol id="icon-chevron-down" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9"/>
  </symbol>
  <symbol id="icon-eye" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </symbol>
  <symbol id="icon-eye-off" viewBox="0 0 24 24">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </symbol>
  <symbol id="icon-sun" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2"  x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2"  y1="12" x2="5"  y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
    <line x1="4.9"  y1="4.9"  x2="7.1"  y2="7.1"/>
    <line x1="16.9" y1="16.9" x2="19.1" y2="19.1"/>
    <line x1="4.9"  y1="19.1" x2="7.1"  y2="16.9"/>
    <line x1="16.9" y1="7.1"  x2="19.1" y2="4.9"/>
  </symbol>
  <symbol id="icon-moon" viewBox="0 0 24 24">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </symbol>
  <symbol id="icon-undo" viewBox="0 0 24 24">
    <polyline points="9 14 4 9 9 4"/>
    <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
  </symbol>
  <symbol id="icon-redo" viewBox="0 0 24 24">
    <polyline points="15 14 20 9 15 4"/>
    <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
  </symbol>
  <symbol id="icon-download" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </symbol>
  <symbol id="icon-upload" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </symbol>
  <symbol id="icon-package" viewBox="0 0 24 24">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </symbol>
  <symbol id="icon-play" viewBox="0 0 24 24">
    <polygon points="6 4 20 12 6 20 6 4"/>
  </symbol>
  <symbol id="icon-pause" viewBox="0 0 24 24">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </symbol>
  <symbol id="icon-stop" viewBox="0 0 24 24">
    <rect x="5" y="5" width="14" height="14" rx="1"/>
  </symbol>
  <symbol id="icon-crosshair" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <line x1="22" y1="12" x2="18" y2="12"/>
    <line x1="6" y1="12" x2="2" y2="12"/>
    <line x1="12" y1="6" x2="12" y2="2"/>
    <line x1="12" y1="22" x2="12" y2="18"/>
  </symbol>
  <symbol id="icon-alert" viewBox="0 0 24 24">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </symbol>
  <symbol id="icon-help" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </symbol>
  <symbol id="icon-book" viewBox="0 0 24 24">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </symbol>
  <symbol id="icon-activity" viewBox="0 0 24 24">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </symbol>
  <symbol id="icon-terminal" viewBox="0 0 24 24">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </symbol>
  <symbol id="icon-copy" viewBox="0 0 24 24">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </symbol>
  <symbol id="icon-git-branch" viewBox="0 0 24 24">
    <line x1="6" y1="3" x2="6" y2="15"/>
    <circle cx="18" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="M18 9a9 9 0 0 1-9 9"/>
  </symbol>
  <symbol id="icon-grip-vertical" viewBox="0 0 24 24">
    <circle cx="9"  cy="6"  r="1.4"/>
    <circle cx="9"  cy="12" r="1.4"/>
    <circle cx="9"  cy="18" r="1.4"/>
    <circle cx="15" cy="6"  r="1.4"/>
    <circle cx="15" cy="12" r="1.4"/>
    <circle cx="15" cy="18" r="1.4"/>
  </symbol>
  <symbol id="icon-file-plus" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="18" x2="12" y2="12"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </symbol>
  <symbol id="icon-save" viewBox="0 0 24 24">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </symbol>
  <symbol id="icon-folder-open" viewBox="0 0 24 24">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </symbol>
  <symbol id="icon-music" viewBox="0 0 24 24">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </symbol>
  <symbol id="icon-speaker" viewBox="0 0 24 24">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </symbol>

  <!-- ============================================================
       Иконки шаблонов проектов
       ============================================================ -->

  <symbol id="icon-tpl-empty" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2.5" stroke-dasharray="2.5 2"/>
    <line x1="12" y1="9" x2="12" y2="15"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
  </symbol>

  <symbol id="icon-tpl-platformer" viewBox="0 0 24 24">
    <line x1="2" y1="20.5" x2="22" y2="20.5"/>
    <line x1="2" y1="8"  x2="9"  y2="8"/>
    <line x1="14" y1="12" x2="22" y2="12"/>
    <circle cx="7" cy="14.5" r="1.6"/>
    <line x1="7" y1="16.1" x2="7" y2="19"/>
    <line x1="4.5" y1="17.5" x2="9.5" y2="17.5"/>
    <line x1="7" y1="19" x2="5" y2="20.5"/>
    <line x1="7" y1="19" x2="9" y2="20.5"/>
  </symbol>

  <symbol id="icon-tpl-topdown" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="1.5"/>
    <rect x="13.5" y="6" width="4.5" height="4.5" rx="0.5"/>
    <rect x="5.5" y="14.5" width="4" height="3.5" rx="0.5"/>
    <circle cx="10.5" cy="11" r="2"/>
    <line x1="10.5" y1="11" x2="10.5" y2="8"/>
  </symbol>

  <!-- ============================================================
       Иконки для проектов (выбор пользователя)
       ============================================================ -->

  <!-- По умолчанию: гексагон с ядром -->
  <symbol id="icon-proj-default" viewBox="0 0 24 24">
    <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z"/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
  </symbol>

  <!-- Платформер: земля, две платформы, человечек -->
  <symbol id="icon-proj-platformer" viewBox="0 0 24 24">
    <line x1="2" y1="20" x2="22" y2="20"/>
    <line x1="2" y1="9" x2="9" y2="9"/>
    <line x1="14" y1="13" x2="22" y2="13"/>
    <circle cx="7" cy="15.2" r="1.6"/>
    <line x1="7" y1="16.8" x2="7" y2="19"/>
    <line x1="7" y1="19" x2="5.3" y2="20"/>
    <line x1="7" y1="19" x2="8.7" y2="20"/>
  </symbol>

  <!-- Вид сверху: комната, крестовина движения -->
  <symbol id="icon-proj-topdown" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="12" cy="12" r="2.2"/>
    <line x1="12" y1="5" x2="12" y2="9.8"/>
    <line x1="12" y1="14.2" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="9.8" y2="12"/>
    <line x1="14.2" y1="12" x2="19" y2="12"/>
  </symbol>

  <!-- RPG: меч -->
  <symbol id="icon-proj-rpg" viewBox="0 0 24 24">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
    <line x1="13" y1="19" x2="19" y2="13"/>
    <line x1="16" y1="16" x2="20" y2="20"/>
    <line x1="19" y1="21" x2="21" y2="19"/>
  </symbol>

  <!-- Космос: ракета -->
  <symbol id="icon-proj-space" viewBox="0 0 24 24">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </symbol>

  <!-- Головоломка: пазл -->
  <symbol id="icon-proj-puzzle" viewBox="0 0 24 24">
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>
  </symbol>

  <!-- Гонки: машина -->
  <symbol id="icon-proj-racing" viewBox="0 0 24 24">
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
    <circle cx="7" cy="17" r="2"/>
    <path d="M9 17h6"/>
    <circle cx="17" cy="17" r="2"/>
  </symbol>

  <!-- Шутер: прицел -->
  <symbol id="icon-proj-shooter" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="3.5"/>
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
  </symbol>

  <!-- Приключение: компас -->
  <symbol id="icon-proj-adventure" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9"/>
    <polygon points="16.5 7.5 14 14 7.5 16.5 10 10"/>
  </symbol>

  <!-- Башня / замок -->
  <symbol id="icon-proj-tower" viewBox="0 0 24 24">
    <path d="M5 21V5l2-1 2 1 2-1 2 1 2-1 2 1 2-1v16"/>
    <line x1="4" y1="21" x2="20" y2="21"/>
    <rect x="10" y="14" width="4" height="7"/>
  </symbol>

  <!-- Аркада: звезда -->
  <symbol id="icon-proj-arcade" viewBox="0 0 24 24">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </symbol>

  <!-- Лабиринт -->
  <symbol id="icon-proj-maze" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="9" y1="3" x2="9" y2="12"/>
    <line x1="15" y1="12" x2="15" y2="21"/>
    <line x1="3" y1="12" x2="9" y2="12"/>
    <line x1="15" y1="12" x2="21" y2="12"/>
  </symbol>
</svg>`;

export function initIcons() {
  const wrap = document.createElement('div');
  wrap.style.position = 'absolute';
  wrap.style.width = '0';
  wrap.style.height = '0';
  wrap.style.overflow = 'hidden';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = SPRITE;
  document.body.insertBefore(wrap, document.body.firstChild);
}

/** Хелпер для генераторов HTML: icon('undo') → <svg class="icon">…</svg>. */
export function icon(name, extraClass = '') {
  const cls = extraClass ? `icon ${extraClass}` : 'icon';
  return `<svg class="${cls}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
}