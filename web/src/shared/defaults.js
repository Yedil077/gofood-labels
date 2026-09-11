import { DEFAULT_DATETIME_CONFIG } from './labelDateTime.js';

/** Значения настроек по умолчанию (сливаются с сохранёнными в хранилище). */
export const DEFAULTS = {
  // Печать (используется агентом)
  'printer.name': '',
  'printer.dryRun': false,
  'print.copiesMode': 'pages', // 'pages' | 'driver'
  'print.scale': 'noscale', // 'noscale' | 'fit' | 'shrink'
  'print.defaultCopies': 1,

  // Геометрия этикетки (физический носитель — 100×70 мм, альбомный)
  'label.widthMm': 100,
  'label.heightMm': 70,
  'label.dpi': 300,
  'label.printRotationDeg': 0,
  'label.safeMm': 3,
  // false = минималистичный векторный макет + фирменный логотип (web/public/logo-gofood.png)
  // true  = фон целиком = картинка web/public/label-template.png
  'label.useTemplate': false,

  // Штрихкод
  'barcode.defaultSource': 'ean13', // 'ean13' (из Артикула) | 'code' | 'artikul'
  'barcode.symbology': 'code128', // для источников code/artikul
  'barcode.showText': true,

  // Синхронизация с iiko (выполняет Print Agent на моноблоке)
  'sync.enabled': true,
  'sync.everyHours': 6,
  'sync.compositionSource': 'direct', // 'direct' — ингредиенты техкарты (чище); 'expanded' — до базового сырья
  'sync.compositionMax': 10, // максимум ингредиентов в составе (по убыванию массы)
  'sync.nutritionBasis': 'portion', // 'portion' | 'per100g'
  'sync.allowNewDishes': false, // добавлять блюда, которых нет в импорте Excel
  // если список пуст — берётся встроенный набор технической мелочи (соль, вода, специи…)
  'sync.excludeIngredients': [],
  'sync.lastRunAt': null,
  'sync.lastResult': null, // { ok, matched, compositionSet, nutritionSet, nutritionPartial, message }

  // Бренд / тексты. preset: 'gofood' | 'greencity' | 'custom'
  'brand.preset': 'gofood',
  'brand.name': 'gofood',
  'brand.primaryColor': '#F2661F',
  'brand.tagline': 'Больше энергии — больше возможностей',
  'brand.logo': 'gofood',
  'brand.fontScale': 1.0,
  'label.showDietType': true, // показывать значок «ПП» / «Классический» у слогана
  // 'ticket' — вес/время/срок хранения по категории (как в iiko-ценнике);
  // 'formula' — старый расчёт даты/времени из контрольных примеров
  'label.timeMode': 'ticket',
  // Вариант ценника по дате изготовления (режим 'ticket'):
  //   'tomorrow' — дата = текущий день + 1 (шаблон iiko «Завтрашний день», по умолчанию);
  //   'today'    — дата = текущий день (шаблон iiko «Сегодняшний день»).
  // Вес и время изготовления по категориям в обоих вариантах одинаковы.
  'label.ticketDay': 'tomorrow',
  'label.shelfHoursDefault': 48, // срок хранения для категорий вне таблицы
  'storage.text': 'Хранить в холодильнике при температуре от +2 °C до +6 °C.',

  // Дата/время
  datetime: DEFAULT_DATETIME_CONFIG,
};

export function mergeSettings(stored) {
  const merged = { ...DEFAULTS, ...(stored || {}) };
  merged.datetime = { ...DEFAULT_DATETIME_CONFIG, ...(merged.datetime || {}) };
  return merged;
}

/** Ключи, которые разрешено записывать через PUT /api/settings. */
export const SETTINGS_KEYS = Object.keys(DEFAULTS);

/** Поля блюда, редактируемые через PUT /api/dishes/:id. */
export const DISH_EDITABLE = [
  'name',
  'category',
  'category_source',
  'composition',
  'composition_source',
  'diet_type',
  'kcal',
  'protein',
  'fat',
  'carbs',
  'nutrition_source',
  'shelf_life_hours',
  'storage_text',
  'barcode_source',
  'active',
];
