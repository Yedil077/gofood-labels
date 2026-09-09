/**
 * Вес порции, время изготовления и срок хранения по категории блюда.
 * Значения совпадают с iiko-шаблоном ценника (IPriceTicket).
 *
 * Сопоставление — по вхождению строки в название категории (как IndexOf в iiko):
 * регистр и лишние пробелы игнорируются, первое совпадение выигрывает.
 * Дата на этикетке — всегда СЛЕДУЮЩИЙ день (текущая дата + 1).
 */

export const DEFAULT_SHELF_HOURS = 42;

// Совпадение по характерной части названия — работает и для «Горячее из курицы»,
// и для «Горячие из курицы» (в iiko-шаблоне написание непоследовательное).
// hideShelf: у горячего строку «Срок хранения» не печатаем.
const RULES = [
  { match: 'из говядины', weight: '340 г', time: '00:05', hideShelf: true },
  { match: 'из индейки', weight: '360 г', time: '00:10', hideShelf: true },
  { match: 'из курицы', weight: '340 г', time: '00:25', hideShelf: true },
  { match: 'из рыбы', weight: '320 г', time: '00:15', hideShelf: true },
  { match: 'десерт', weight: '170 г', time: '00:45', shelfHours: 72 },
  { match: 'завтрак', weight: '150 г', time: '01:00' },
  { match: 'напит', weight: '500 мл', time: '01:10', shelfHours: 72 },
  { match: 'перекус', weight: '140 г', time: '01:15' },
  { match: 'салат', weight: '160 г', time: '02:05' },
  { match: 'суп', weight: '400 г', time: '00:40' },
];

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {string} category  название категории блюда
 * @param {string} [group]   крупная группа (запасное совпадение)
 * @returns {{weight:string,time:string,shelfHours:number}|null}
 */
export function resolveTicketRule(category, group) {
  const hay = norm(category) + ' | ' + norm(group);
  for (const r of RULES) {
    if (hay.includes(r.match)) {
      return {
        weight: r.weight,
        time: r.time,
        shelfHours: r.shelfHours || DEFAULT_SHELF_HOURS,
        hideShelf: r.hideShelf === true,
      };
    }
  }
  return null;
}

/** Дата этикетки = дата `now` + 1 день, «dd.MM.yyyy». `now` — Date, ISO/локальная строка или пусто. */
export function ticketDate(now) {
  let d = now instanceof Date ? now : null;
  if (!d && typeof now === 'string') {
    const m = now.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  }
  if (!d || Number.isNaN(d.getTime())) d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return `${pad2(t.getDate())}.${pad2(t.getMonth() + 1)}.${t.getFullYear()}`;
}
