/**
 * Локализация значений в выпадающих списках.
 *
 * Значения (value) остаются английскими идентификаторами —
 * они уходят в параметры событий, физику, сохранённые проекты.
 * Меняется только то, что видит пользователь.
 *
 * OPTION_LABELS      — глобальные метки для «очевидных» значений.
 * OPTION_LABELS_BY_PARAM — метки, зависящие от контекста параметра
 *                          (например, для paramId='visible').
 */

export const OPTION_LABELS = {
  // Физика — тип тела
  'static':    'Статичное',
  'dynamic':   'Динамическое',
  'kinematic': 'Кинематическое',

  // Физика — форма
  'box':    'Прямоугольник',
  'circle': 'Круг',

  // Операторы сравнения
  '==': 'равно',
  '!=': 'не равно',
  '<':  'меньше',
  '<=': 'меньше или равно',
  '>':  'больше',
  '>=': 'больше или равно',
};

export const OPTION_LABELS_BY_PARAM = {
  // SetVisible → параметр visible
  visible: {
    'true':  'Показать',
    'false': 'Скрыть',
  },
};

/**
 * Возвращает человекочитаемую метку для значения.
 * Если paramId задан и для него есть переопределение — берётся оно.
 * Иначе — глобальная метка. Иначе — само значение.
 */
export function optionLabel(value, paramId = null) {
  if (paramId) {
    const byParam = OPTION_LABELS_BY_PARAM[paramId];
    if (byParam && byParam[value] !== undefined) return byParam[value];
  }
  return OPTION_LABELS[value] ?? value;
}