/**
 * Вычисляет стартовые значения параметров для нового условия/действия.
 *
 * Отличие от «сырых» defaults из registry — учитывает состояние проекта:
 * если default ссылается на переменную или instvar, которых нет,
 * подставляется первое доступное значение либо пустая строка.
 * Это избавляет от мгновенного ⚠ у только что добавленного события.
 *
 * Ключи обрабатываются по порядку, поэтому для instvar уже известен
 * выбранный ранее target.
 */

export function computeDefaultParams(def, { scene, vars }) {
  const params = {};
  const seen = {};

  for (const p of (def.params || [])) {
    const v = computeDefaultParam(p, seen, { scene, vars });
    params[p.id] = v;
    seen[p.id] = v;
  }

  return params;
}

function computeDefaultParam(p, seen, { scene, vars }) {
  switch (p.type) {
    case 'target': {
      return p.default ?? '*';
    }

    case 'prefab': {
      const names = [...new Set(
        scene.objects.map((o) => o.name).filter(Boolean)
      )].sort();
      return names[0] || '';
    }

    case 'varname': {
      const names = Object.keys(vars || {});
      if (names.length > 0) return names[0];
      return '';
    }

    case 'instvar': {
      const target = seen.target || '*';
      for (const o of scene.objects) {
        if (target === '*' || o.name === target) {
          const keys = Object.keys(o.properties || {});
          if (keys.length > 0) return keys[0];
        }
      }
      return '';
    }

    case 'number':
      return p.default ?? 0;

    case 'string':
      return p.default ?? '';

    case 'select':
      return p.default ?? (p.options && p.options[0]) ?? '';

    case 'key':
      return p.default ?? 'Space';

    default:
      return p.default ?? '';
  }
}