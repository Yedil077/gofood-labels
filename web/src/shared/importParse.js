/**
 * Разбор выгрузки блюд.  На вход — «сырые» строки (массив массивов),
 * которые фронтенд получает из SheetJS: XLSX.utils.sheet_to_json(ws, { header: 1 }).
 *
 * Структура (проверено на реальном файле «Блюда*.xlsx»):
 *   слева несколько колонок названия -> иерархия:
 *     кол.0/1 = корневая группа («2-этаж Каспий»),
 *     кол.2   = категория («Горячее из говядины», «Салаты», …),
 *     кол.3   = блюдо.
 *   «Тип» = «Группа» | «Блюдо».  Печатаются только «Блюдо».
 *   Категория блюда = ближайшая группа строго ЛЕВЕЕ колонки названия.
 */

const HEADER_ALIASES = {
  artikul: ['артикул'],
  code: ['код'],
  type: ['тип'],
  unit: ['ед. измерения', 'ед.измерения', 'единица измерения'],
  price: ['цена, тнг', 'цена'],
  cost: ['себестоимость, тнг'],
  cost_pct: ['себестоимость, %'],
  sale_places: ['места продаж'],
  cook_norm: ['время пригот. норма'],
  cook_peak: ['время пригот. пик'],
};

const norm = (v) => String(v ?? '').trim().toLowerCase();

function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace('*', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function cellStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const lower = (rows[r] || []).map(norm);
    if (lower.includes('тип') && lower.includes('код')) {
      const map = {};
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = lower.findIndex((c) => aliases.includes(c));
        if (idx >= 0) map[key] = idx;
      }
      const leftBound = map.artikul ?? map.type ?? 4;
      map.nameCols = Array.from({ length: leftBound }, (_, i) => i);
      return { headerRow: r, map };
    }
  }
  return null;
}

function nameColOf(row, nameCols) {
  for (const i of nameCols) if (cellStr(row[i]) != null) return i;
  return -1;
}

export function parseRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Пустой файл');
  const found = findHeader(rows);
  if (!found) throw new Error('Не найдена строка заголовка (нужны колонки «Тип» и «Код»).');
  const { headerRow, map } = found;

  const groupStack = {};
  const dishes = [];
  const groups = [];
  let skipped = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => c == null || String(c).trim() === '')) {
      skipped++;
      continue;
    }
    const type = norm(row[map.type]);
    const nameCol = nameColOf(row, map.nameCols);
    const name = nameCol >= 0 ? cellStr(row[nameCol]) : null;

    if (type === 'группа') {
      if (name != null) {
        groupStack[nameCol] = name;
        for (const k of Object.keys(groupStack)) if (Number(k) > nameCol) delete groupStack[k];
        groups.push({ level: nameCol, name });
      }
      continue;
    }
    if (type !== 'блюдо' || !name) {
      skipped++;
      continue;
    }

    let category = null;
    let categorySource = 'none';
    const shallower = Object.keys(groupStack)
      .map(Number)
      .filter((k) => k < nameCol)
      .sort((a, b) => b - a);
    if (shallower.length) {
      category = groupStack[shallower[0]];
      categorySource = nameCol >= 3 ? 'excel' : 'uncertain';
    }

    dishes.push({
      name,
      artikul: cellStr(row[map.artikul]),
      code: cellStr(row[map.code]),
      type: 'Блюдо',
      category,
      category_source: categorySource,
      unit: cellStr(row[map.unit]),
      price: toNumber(row[map.price]),
      cost: toNumber(row[map.cost]),
      cost_pct: toNumber(row[map.cost_pct]),
      sale_places: cellStr(row[map.sale_places]),
      cook_time_norm: cellStr(row[map.cook_norm]),
      cook_time_peak: cellStr(row[map.cook_peak]),
      raw_row: r + 1,
    });
  }

  return { rowsTotal: rows.length, headerRow, columnMap: map, groups, dishes, skipped };
}
