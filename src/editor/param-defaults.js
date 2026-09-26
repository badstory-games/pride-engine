/**
 * Вычисляет стартовые значения параметров нового условия/действия.
 * Учитывает состояние проекта: подбирает первую доступную переменную,
 * объект, звук — чтобы новое событие не начиналось с ⚠.
 *
 * opts.assets — опционально. Если передан, используется для подбора
 * значений типа `sound`. При отсутствии — вернётся пустая строка.
 */

export function computeDefaultParams(def, { scene, vars, assets }) {
  const params = {};
  const seen = {};

  for (const p of (def.params || [])) {
    const v = computeDefaultParam(p, seen, { scene, vars, assets });
    params[p.id] = v;
    seen[p.id] = v;
  }

  return params;
}

function computeDefaultParam(p, seen, { scene, vars, assets }) {
  switch (p.type) {
    case 'target':
      return p.default ?? '*';

    case 'prefab': {
      const set = new Set();
      const objs = scene.objects;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o._dead) continue;
        if (o.name) set.add(o.name);
      }
      const names = [...set].sort();
      return names[0] || '';
    }

    case 'varname': {
      const names = Object.keys(vars || {});
      return names.length > 0 ? names[0] : '';
    }

    case 'instvar': {
      const target = seen.target || '*';
      const objs = scene.objects;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o._dead) continue;
        if (target === '*' || o.name === target) {
          const keys = Object.keys(o.properties || {});
          if (keys.length > 0) return keys[0];
        }
      }
      return '';
    }

    case 'sound': {
      if (!assets) return '';
      const ids = assets.listAudioIds();
      return ids.length > 0 ? ids[0] : '';
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