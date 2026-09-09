/**
 * Сборка номенклатуры из iiko: список позиций { num, code, name, composition }
 * для отправки в /api/sync/nomenclature. Изоморфно (Node-агент и Cloudflare).
 *
 * КБЖУ через API iiko этого сервера не отдаётся (проверено) — берём только состав
 * из техкарт. КБЖУ загружается отдельным Excel-импортом.
 */
import { chartProductId, chartItems, itemProductId, itemNetKg } from './iiko.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[\s\-–—]+/g, ' ')
    .replace(/[.,;:()]+/g, '')
    .trim();

export const DEFAULT_EXCLUDE = [
  'соль', 'вода', 'перец', 'сахар', 'масло растительное', 'масло подсолнечное',
  'масло для фритюра', 'масло для жарки', 'крахмал', 'мука для панировки',
  'специи', 'приправа', 'приправы', 'зира', 'куркума', 'паприка', 'лавровый лист',
  'уксус', 'сода', 'разрыхлитель', 'дрожжи', 'желатин', 'агар', 'загуститель',
  'кислота лимонная', 'лимонная кислота', 'ванилин', 'краситель', 'консервант',
  'глютамат', 'бульон', 'бульонный концентрат', 'декор', 'украшение',
];

const DROP_WORDS = new Set(
  (
    'полуфабрикат полу фабрикат пф п/ф вес весовой весовая весовые весов ' +
    'очищенный очищенная очищенные очищенное отварной отварная отварные отварнои варёный вареный варёное вареное ' +
    'чищенный чищенная чищенные чищенное чищеный чищеная ' +
    'бланшированный пассерованный обжаренный жареный жареная тушёный тушеный копч копчёная копченая ' +
    'товар рецепт р этаж кур ' +
    'г гр кг мл л шт порц порция порций уп упак кус кусочки'
  ).split(/\s+/)
);
const DROP_PREFIX = ['заготов', 'заморож', 'охлажд', 'охл', 'свеж', 'размор', 'бланшир', 'пассеров', 'чищен'];

const PACK_RX =
  /контейн|конт\.|коробк|кор\.|крышк|соусник|стакан|стаканч|пакет|пак\.|упаков|уп\.|ланч|бумаж|салфет|прибор|вилк|ложк|нож\b|шпаж|зубочист|трубочк|наклей|этикет|стрейч|пл[её]нк|термоусад|лоток|бланк|промоуш|промо\b|тар[аы]\b|расходн|инвентар|перчат|фольг|бутыл/i;
const TAG_RX =
  /\+\s*[а-яёa-z]|\b(обед|ужин|завтрак|полдник|перекус|детокс|рацион|программа|меню\s*дня|день\s*\d)\b/i;

function isFoodItem(prod, groupName) {
  if (!prod) return false;
  const t = String(prod.type || prod.productType || '').toUpperCase();
  if (t && !['GOODS', 'PREPARED', 'DISH'].includes(t)) return false;
  const nm = String(prod.name || prod.productName || '');
  if (!nm || PACK_RX.test(nm)) return false;
  const gn = groupName ? groupName(prod.parent) : '';
  if (gn && PACK_RX.test(gn)) return false;
  return true;
}

export function cleanIngredient(raw) {
  let s = String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["'«»*]/g, ' ')
    .replace(/^\s*п\.?\s*\/?\s*ф\.?(?=\s|$)/i, ' ') // ведущий «пФ» / «п/ф» / «п.ф.»
    .replace(/[-–—]\s*\d?\s*этаж\w*/gi, ' ') // метка места «- этаж» / «-1 этаж»
    .replace(/(^|\s)[а-яёa-z]{1,3}\/[а-яёa-z]{1,3}(?=\s|$)/gi, ' ')
    .replace(/№\s*\d+/g, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:г|гр|кг|мл|л|%)?/gi, ' ')
    .replace(/[._/\\]+/g, ' ');
  const words = s
    .split(/[\s,;:]+/)
    .filter(Boolean)
    .filter((w) => {
      const lw = w.toLowerCase().replace(/[.]+$/, '');
      if (DROP_WORDS.has(lw)) return false;
      if (DROP_PREFIX.some((p) => lw.startsWith(p))) return false;
      return true;
    });
  s = words.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length < 2) return '';
  return s.toLowerCase();
}

/**
 * Правит грамматику/опечатки в готовой строке состава. Только явные, безопасные
 * замены — ничего не додумывает. Обрабатывает по ингредиентам (разбивка по запятой).
 */
export function polishComposition(s) {
  if (!s) return s;
  const src = String(s)
    .toLowerCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  for (let it of src) {
    it = it
      // кластеры зелени -> разбить (через | -> потом отдельные позиции)
      .replace(/укроп петрушка кинза/g, 'укроп|петрушка|кинза')
      .replace(/петрушка укроп кинза/g, 'укроп|петрушка|кинза')
      .replace(/укроп кинза петрушка/g, 'укроп|петрушка|кинза')
      .replace(/кинза петрушка укроп/g, 'укроп|петрушка|кинза')
      // грамматика / опечатки
      .replace(/для бельгийские вафли/g, 'для бельгийских вафель')
      .replace(/грецский/g, 'грецкий')
      .replace(/сезон?ые/g, 'сезонные')
      .replace(/пассированн/g, 'пассерованн')
      .replace(/консервированый/g, 'консервированный')
      .replace(/ и грибами$/g, ' с грибами')
      .replace(/ и очищн\.?$/g, '')
      .replace(/ очищн\.?$/g, ' очищенный')
      .replace(/по-тайский/g, 'по-тайски')
      .replace(/\+$/g, '')
      .replace(/^кукуруза консер(в|ва)?$/g, 'кукуруза консервированная')
      .replace(/ консер[вы]?$/g, ' консервированные') // «огурцы консер» -> «...ные»
      .replace(/^(паста|макароны) гранора$/g, '$1')
      .replace(/запеченная филе/g, 'запечённое филе')
      // служебные хвосты
      .replace(/ для бризоля каспи$/g, '')
      .replace(/ для бризоля$/g, '')
      .replace(/ каспи от$/g, '')
      .replace(/ каспи[йя]?$/g, '')
      .replace(/ для смазки$/g, '')
      .replace(/[-–—]\s*\d?\s*этаж\w*/g, '')
      // «X соус» -> «соус X», дубли
      .replace(/^соус сливочно-грибной соус$/g, 'сливочно-грибной соус')
      .replace(/^терияки соус$/g, 'соус терияки')
      .replace(/^свит-чили соус$/g, 'соус свит-чили')
      .replace(/^барбекью соус$/g, 'соус барбекью')
      .replace(/\s{2,}/g, ' ')
      .trim();
    for (const part of it.split('|')) {
      const p = part.trim();
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out.join(', ');
}

function pickChart(charts, todayISO) {
  let best = null;
  for (const c of charts) {
    const from = c.dateFrom || c.date || '0000';
    const to = c.dateTo || '9999';
    if (from <= todayISO && todayISO <= to) return c;
    if (!best || (c.dateFrom || '') > (best.dateFrom || '')) best = c;
  }
  return best;
}

/**
 * @param {import('./iiko.js').Iiko} iiko  уже авторизованный клиент
 * @param {object} settings  настройки с сайта (sync.*)
 * @param {(msg:string)=>void} log
 * @returns {Promise<{items:Array, stats:object}>}
 */
export async function buildNomenclatureItems(iiko, settings = {}, log = () => {}) {
  const userExcl = settings['sync.excludeIngredients'];
  const excl = (Array.isArray(userExcl) && userExcl.length ? userExcl : DEFAULT_EXCLUDE)
    .map(norm)
    .filter(Boolean);
  const compSource = settings['sync.compositionSource'] || 'direct';
  const compMax = Math.max(3, Math.min(30, Number(settings['sync.compositionMax']) || 10));

  const products = await iiko.getProducts();
  log(`номенклатура: ${products.length} позиций`);
  const today = new Date().toISOString().slice(0, 10);
  const { assemblyCharts, preparedCharts } = await iiko.getAssemblyCharts(today, today);
  log(`техкарты: ${assemblyCharts.length}, разложенные: ${preparedCharts.length}`);

  let groups = new Map();
  try {
    groups = await iiko.getProductGroups();
  } catch {
    /* no-op */
  }
  const groupName = (id) => (id != null ? groups.get(String(id)) || '' : '');

  const P = new Map();
  for (const p of products) if (p && p.id != null) P.set(String(p.id), p);

  const groupA = new Map();
  const groupP = new Map();
  const push = (m, k, v) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  };
  for (const c of assemblyCharts) push(groupA, String(chartProductId(c)), c);
  for (const c of preparedCharts) push(groupP, String(chartProductId(c)), c);

  const items = [];
  let dishCount = 0;
  let compCount = 0;

  for (const [pid, p] of P) {
    const type = String(p.type || p.productType || '').toUpperCase();
    const aCharts = groupA.get(pid);
    if (type && type !== 'DISH' && type !== 'PREPARED' && !aCharts) continue;
    if (!aCharts && !groupP.get(pid)) continue;
    dishCount++;

    const aChart = aCharts && pickChart(aCharts, today);
    const pCh = groupP.get(pid) && pickChart(groupP.get(pid), today);
    const compChart = compSource === 'direct' ? aChart || pCh : pCh || aChart;

    let composition = '';
    if (compChart) {
      const acc = new Map();
      for (const it of chartItems(compChart)) {
        const ing = P.get(String(itemProductId(it)));
        if (!isFoodItem(ing, groupName)) continue;
        const kg = itemNetKg(it) || 0;
        if (kg <= 0.0003) continue;
        const rawNm = ing.name || ing.productName || '';
        if (TAG_RX.test(rawNm)) continue;
        const nm = cleanIngredient(rawNm);
        if (!nm) continue;
        const low = norm(nm);
        if (!low || low.length < 2 || excl.some((e) => low.includes(e))) continue;
        const cur = acc.get(low);
        if (cur) cur.kg += kg;
        else acc.set(low, { name: nm, kg });
      }
      composition = polishComposition(
        [...acc.values()]
          .sort((a, b) => b.kg - a.kg)
          .slice(0, compMax)
          .map((x) => x.name)
          .join(', ')
      );
      if (composition) compCount++;
    }

    items.push({
      iikoId: pid,
      num: p.num != null ? String(p.num).trim() : null,
      code: p.code != null ? String(p.code).trim() : null,
      name: (p.name || p.productName || '').trim(),
      composition,
    });
  }

  const stats = {
    products: products.length,
    charts: assemblyCharts.length,
    dishes: dishCount,
    compositions: compCount,
  };
  log(`подготовлено ${items.length} позиций, состав у ${compCount}`);
  return { items, stats };
}
