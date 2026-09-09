/** КБЖУ: расчёт калорийности и склонение «час». */

/** Ккал по формуле Атуотера: белки*4 + углеводы*4 + жиры*9. Округляется. */
export function kcalFromMacros(protein, fat, carbs) {
  for (const v of [protein, fat, carbs]) {
    if (v === null || v === undefined || v === '') return null; // не хватает данных
  }
  const p = Number(protein);
  const f = Number(fat);
  const c = Number(carbs);
  if (!Number.isFinite(p) || !Number.isFinite(f) || !Number.isFinite(c)) return null;
  return Math.round(p * 4 + c * 4 + f * 9);
}

/** Русское склонение слова «час» для числа N: 1 час, 2 часа, 5 часов, 48 часов, 72 часа. */
export function hoursWord(n) {
  const a = Math.abs(Math.trunc(Number(n) || 0)) % 100;
  if (a >= 11 && a <= 14) return 'часов';
  const b = a % 10;
  if (b === 1) return 'час';
  if (b >= 2 && b <= 4) return 'часа';
  return 'часов';
}
