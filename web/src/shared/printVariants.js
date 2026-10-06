/**
 * Варианты печати (для кого печатаем). Выбираются на экране печати.
 * «Айдар» — свои холодильники: срок хранения 72 часа у всех блюд, остальное как обычно.
 */
export const PRINT_VARIANTS = [
  { id: 'standard', title: 'Обычный' },
  { id: 'aidar', title: 'Айдар', shelfHours: 72 },
];

export function printVariantById(id) {
  return PRINT_VARIANTS.find((v) => v.id === id) || PRINT_VARIANTS[0];
}
