/** Общая логика: источник штрихкода, предупреждения, нормализация блюда для этикетки. */
import { ean13FromArtikul } from './barcode.js';
import { resolveBrand } from './brand.js';
import { resolveDietType, dietTypeLabel } from './dietType.js';
import { resolveTicketRule, ticketDate, DEFAULT_SHELF_HOURS } from './priceTicket.js';
import { groupOf } from './categories.js';
import { kcalFromMacros, hoursWord } from './kbju.js';

export const WARNING_TEXT = {
  composition: 'Не заполнен состав',
  kbju: 'Не заполнено КБЖУ',
  category: 'Не указана категория',
  barcode: 'Отсутствует штрихкод (Код / Артикул)',
};

export function pickBarcodeValue(dish, settings) {
  const src = dish.barcode_source || settings['barcode.defaultSource'] || 'ean13';
  if (src === 'ean13') {
    const v = ean13FromArtikul(dish.artikul);
    if (v) return { source: 'ean13', value: v, symbology: 'ean13' };
    // 6-значный артикул или нет артикула — откат на Код
    const c = dish.code ? String(dish.code).trim() : '';
    return { source: 'code', value: c, symbology: 'code128' };
  }
  const val = src === 'artikul' ? dish.artikul : dish.code;
  return { source: src, value: val ? String(val).trim() : '', symbology: 'code128' };
}

export function warningsForDish(dish, settings) {
  const w = [];
  if (!dish.composition || !String(dish.composition).trim()) w.push('composition');
  const hasKbju =
    dish.kcal != null || dish.protein != null || dish.fat != null || dish.carbs != null;
  if (!hasKbju) w.push('kbju');
  if (!dish.category || !String(dish.category).trim()) w.push('category');
  if (!pickBarcodeValue(dish, settings).value) w.push('barcode');
  return w;
}

export function warningObjects(dish, settings) {
  return warningsForDish(dish, settings).map((code) => ({ code, text: WARNING_TEXT[code] }));
}

/**
 * Готовит плоский объект для отрисовки этикетки (одинаково в браузере и в агенте).
 * @param {object} dish     запись блюда
 * @param {object} settings  слитые настройки
 * @param {{date:string,time:string,approximate?:boolean}} dt
 */
export function normalizeDishForLabel(dish, settings, dt) {
  const bc = pickBarcodeValue(dish, settings);

  // Режим 'ticket' (по умолчанию): вес/время/срок хранения по категории (как в iiko-ценнике),
  // дата = следующий день. Режим 'formula' — старый расчёт из dt.
  const ticketMode = (settings['label.timeMode'] || 'ticket') !== 'formula';
  const rule = resolveTicketRule(dish.category, groupOf(dish.category).group);
  const shelfHours = rule ? rule.shelfHours
    : Number(settings['label.shelfHoursDefault']) || DEFAULT_SHELF_HOURS;

  let dateStr = dt?.date || '';
  let timeStr = dt?.time || '';
  let approximate = !!dt?.approximate;
  if (ticketMode) {
    dateStr = ticketDate(dt?.now);
    timeStr = rule ? rule.time : '';
    approximate = false;
  }

  // Условия хранения: температурная строка + «Срок хранения N часов» (N по категории).
  const baseStorage = (dish.storage_text || settings['storage.text'] || '')
    .replace(/\s*срок\s+хранения[^.\n]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const shelfLine = `Срок хранения ${shelfHours} ${hoursWord(shelfHours)}.`;
  const storageText = [baseStorage, shelfLine].filter(Boolean).join('\n');

  // Ккал: если не задано, но есть Б/Ж/У — считаем по формуле Атуотера.
  const kcal = dish.kcal ?? kcalFromMacros(dish.protein, dish.fat, dish.carbs);

  return {
    name: dish.name || '',
    category: dish.category || '',
    weight: rule ? rule.weight : '',
    shelfHours,
    kbju: {
      protein: dish.protein ?? null,
      fat: dish.fat ?? null,
      carbs: dish.carbs ?? null,
      kcal: kcal ?? null,
    },
    composition: dish.composition || '',
    barcodeValue: bc.value,
    barcodeSource: bc.source,
    symbology: bc.symbology || settings['barcode.symbology'] || 'code128',
    showBarcodeText: settings['barcode.showText'] !== false,
    storageText,
    dateStr,
    timeStr,
    approximateTime: approximate,
    brand: resolveBrand(settings), // { name, logo, tagline, color }
    fontScale: Number(settings['brand.fontScale']) || 1,
    dietType: resolveDietType(dish), // 'pp' | 'classic'
    dietTypeLabel: dietTypeLabel(dish), // 'ПП' | 'Классический' (для кнопок в UI)
    dietTypeLabelFull:
      resolveDietType(dish) === 'pp' ? 'Правильное питание' : 'Классическое питание',
    showDietType: settings['label.showDietType'] !== false,
  };
}
