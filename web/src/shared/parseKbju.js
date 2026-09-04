/**
 * Разбор Excel с КБЖУ. На вход — массив массивов (SheetJS header:1).
 * Ищет строку заголовка с колонками: (Код|Артикул) + Белки + Жиры + Углеводы + (Ккал|Калорийность|Энергетическая).
 * Возвращает [{ keyType:'code'|'artikul', key, protein, fat, carbs, kcal }].
 */

const norm = (v) => String(v ?? '').trim().toLowerCase();

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace('*', '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MATCH = {
  code: [/^код$/, /^code$/],
  artikul: [/^артикул/, /^sku/, /^num$/],
  protein: [/белк/, /^protein/, /^б$/, /^б,/],
  fat: [/жир/, /^fat/, /^ж$/, /^ж,/],
  carbs: [/углевод/, /^carb/, /^у$/, /^у,/],
  kcal: [/ккал/, /калор/, /энергет/, /energy/, /kcal/],
};

function findCol(headerLower, keys) {
  for (let i = 0; i < headerLower.length; i++) {
    const h = headerLower[i];
    if (keys.some((rx) => rx.test(h))) return i;
  }
  return -1;
}

export function parseKbjuRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Пустой файл');

  let headerRow = -1;
  let cols = null;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const low = (rows[r] || []).map(norm);
    const c = {
      code: findCol(low, MATCH.code),
      artikul: findCol(low, MATCH.artikul),
      protein: findCol(low, MATCH.protein),
      fat: findCol(low, MATCH.fat),
      carbs: findCol(low, MATCH.carbs),
      kcal: findCol(low, MATCH.kcal),
    };
    const hasKey = c.code >= 0 || c.artikul >= 0;
    const hasVal = [c.protein, c.fat, c.carbs, c.kcal].filter((x) => x >= 0).length >= 2;
    if (hasKey && hasVal) {
      headerRow = r;
      cols = c;
      break;
    }
  }
  if (!cols) {
    throw new Error(
      'Не найдены колонки. Нужны: «Код» или «Артикул», и минимум 2 из: Белки, Жиры, Углеводы, Ккал.'
    );
  }

  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const codeV = cols.code >= 0 ? String(row[cols.code] ?? '').trim() : '';
    const artV = cols.artikul >= 0 ? String(row[cols.artikul] ?? '').trim() : '';
    const key = codeV || artV;
    if (!key) continue;
    const rec = {
      keyType: codeV ? 'code' : 'artikul',
      key,
      protein: cols.protein >= 0 ? toNum(row[cols.protein]) : null,
      fat: cols.fat >= 0 ? toNum(row[cols.fat]) : null,
      carbs: cols.carbs >= 0 ? toNum(row[cols.carbs]) : null,
      kcal: cols.kcal >= 0 ? toNum(row[cols.kcal]) : null,
    };
    if (rec.protein == null && rec.fat == null && rec.carbs == null && rec.kcal == null) continue;
    out.push(rec);
  }
  return { headerRow, columns: cols, rows: out };
}
