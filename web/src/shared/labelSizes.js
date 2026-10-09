/**
 * Размеры этикетки, которые можно выбрать на экране печати.
 * 80×50 — «Макет 1», 100×70 — классический макет, круги Ø50/Ø60 (квадратный носитель) —
 * круглая наклейка (см. pickLayout в labelDraw.js).
 */
export const LABEL_SIZES = [
  { id: '80x50', widthMm: 80, heightMm: 50, title: '80 × 50 мм' },
  { id: '100x70', widthMm: 100, heightMm: 70, title: '100 × 70 мм' },
  { id: 'r50', widthMm: 50, heightMm: 50, round: true, title: '⭘ Круг 5 см' },
  { id: 'r60', widthMm: 60, heightMm: 60, round: true, title: '⭘ Круг 6 см' },
];

export function labelSizeById(id) {
  return LABEL_SIZES.find((s) => s.id === id) || null;
}

/** Размер по ширине/высоте из настроек (или первый, если не совпало). */
export function labelSizeFor(widthMm, heightMm) {
  return LABEL_SIZES.find((s) => s.widthMm === Number(widthMm) && s.heightMm === Number(heightMm)) || LABEL_SIZES[0];
}
