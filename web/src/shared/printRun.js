/**
 * Расчёт тиража: сколько печатать заполненных и пустых этикеток.
 *
 * Пустая этикетка в конце нужна для функции Cut принтера Epson: последнюю наклейку
 * сотрудники заполняют от руки. Правила:
 *  - количество от пользователя — ВСЕГДА только заполненные этикетки;
 *  - 3 и меньше — пустой нет;
 *  - больше 3 и настройка включена — ровно одна пустая в конце;
 *  - настройка выключена — пустой нет никогда.
 */
export const BLANK_MIN_FILLED = 4;

export function calcPrintRun(quantity, blankEnabled = true) {
  const filled = Math.max(1, Math.min(999, Math.round(Number(quantity) || 1)));
  const blank = blankEnabled !== false && filled >= BLANK_MIN_FILLED ? 1 : 0;
  return { filled, blank, total: filled + blank };
}

/** Настройка «пустая в конце» из настроек сайта (по умолчанию включена). */
export function blankEnabledFrom(settings) {
  return (settings || {})['print.blankAtEnd'] !== false;
}
