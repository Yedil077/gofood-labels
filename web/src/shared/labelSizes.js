/**
 * Размеры этикетки, которые можно выбрать на экране печати.
 * 80×50 рисуется «Макетом 1», 100×70 — классическим макетом (см. pickLayout в labelDraw.js).
 */
export const LABEL_SIZES = [
  { id: '80x50', widthMm: 80, heightMm: 50, title: '80 × 50 мм' },
  { id: '100x70', widthMm: 100, heightMm: 70, title: '100 × 70 мм' },
];

export function labelSizeById(id) {
  return LABEL_SIZES.find((s) => s.id === id) || null;
}

/** Размер по ширине/высоте из настроек (или первый, если не совпало). */
export function labelSizeFor(widthMm, heightMm) {
  return LABEL_SIZES.find((s) => s.widthMm === Number(widthMm) && s.heightMm === Number(heightMm)) || LABEL_SIZES[0];
}
