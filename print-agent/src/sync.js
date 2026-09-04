import {
  Iiko,
  nutritionPer100g,
  parseNutritionXml,
  chartProductId,
  chartItems,
  itemProductId,
  itemNetKg,
} from './iiko.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[\s\-–—]+/g, ' ')
    .replace(/[.,;:()]+/g, '')
    .trim();

// Ингредиенты, которые не показываем покупателю (техническая мелочь).
const DEFAULT_EXCLUDE = [
  'соль', 'вода', 'перец', 'сахар', 'масло растительное', 'масло подсолнечное',
  'масло для фритюра', 'масло для жарки', 'крахмал', 'мука для панировки',
  'специи', 'приправа', 'приправы', 'зира', 'куркума', 'паприка', 'лавровый лист',
  'уксус', 'сода', 'разрыхлитель', 'дрожжи', 'желатин', 'агар', 'загуститель',
  'кислота лимонная', 'лимонная кислота', 'ванилин', 'краситель', 'консервант',
  'глютамат', 'бульон', 'бульонный концентрат', 'декор', 'украшение',
];

// Служебные слова, которые убираем из имени ингредиента.
const DROP_WORDS = new Set(
  (
    'полуфабрикат полу фабрикат вес весовой весовая весовые весов ' +
    'очищенный очищенная очищенные отварной отварная отварные отварнои варёный вареный ' +
    'бланшированный пассерованный обжаренный жареный жареная тушёный тушеный ' +
    'г гр кг мл л шт порц порция порций уп упак кус кусочки'
  ).split(/\s+/)
);
// Слова, начинающиеся с этих корней — тоже убираем.
const DROP_PREFIX = ['заготов', 'заморож', 'охлажд', 'охл', 'свеж', 'размор', 'бланшир', 'пассеров'];

/** Приводит имя ингредиента к человекочитаемому виду. */
export function cleanIngredient(raw) {
  let s = String(raw || '')
    .replace(/\([^)]*\)/g, ' ') // (…) убрать
    .replace(/["'«»]/g, ' ')
    .replace(/(^|\s)[а-яёa-z]{1,3}\/[а-яёa-z]{1,3}(?=\s|$)/gi, ' ') // п/ф, с/м, б/к
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
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function pickChart(charts, todayISO) {
  // charts — массив версий одной техкарты; берём действующую на сегодня, иначе последнюю
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
 * Полный цикл синхронизации.
 * @param {object} cfg  agent-config (нужен cfg.iiko и cfg.apiBase/agentToken)
 * @param {(url,init)=>Promise<any>} pushToCloud  функция POST в наш API
 * @param {object} settings  настройки с сайта (sync.*)
 * @param {(level,msg)=>void} log
 */
export async function runSync(cfg, pushToCloud, settings, log = () => {}) {
  if (!cfg.iiko || !cfg.iiko.host || !cfg.iiko.login) {
    throw new Error('В agent-config.json не заполнен блок "iiko" (host, login, password)');
  }
  const userExcl = settings['sync.excludeIngredients'];
  const excl = (Array.isArray(userExcl) && userExcl.length ? userExcl : DEFAULT_EXCLUDE)
    .map(norm)
    .filter(Boolean);
  const basis = settings['sync.nutritionBasis'] || 'portion';
  const compSource = settings['sync.compositionSource'] || 'expanded'; // 'expanded' | 'direct'
  const compMax = Math.max(3, Math.min(30, Number(settings['sync.compositionMax']) || 12));

  const iiko = new Iiko(cfg.iiko);
  log('info', `iiko: авторизация на ${iiko.host}…`);
  await iiko.auth();

  try {
    const products = await iiko.getProducts();
    log('info', `iiko: номенклатура — ${products.length} позиций`);
    // диагностика: сколько позиций с заполненной пищевой ценностью
    let withNutr = 0;
    for (const p of products) {
      const n = nutritionPer100g(p);
      if (n.protein != null || n.fat != null || n.carbs != null || n.kcal != null) withNutr++;
    }
    log('info', `iiko: с пищевой ценностью на 100 г — ${withNutr}`);
    if (products.length && withNutr === 0) {
      // ищем позицию, где вообще есть похожие на ценность поля
      const rx = /protein|fat|carb|energy|calor|nutri|бел|жир|угл|ккал|энерг/i;
      let sample = products.find((p) => Object.keys(p || {}).some((k) => rx.test(k)));
      const keysOf = (p) => Object.keys(p || {}).filter((k) => rx.test(k));
      if (sample) {
        const picked = {};
        for (const k of keysOf(sample)) picked[k] = sample[k];
        log('warn', `iiko: КБЖУ-поля есть, но с другими именами. Пример: ${JSON.stringify(picked)}`);
      } else {
        // ни одного похожего поля — покажем полный набор ключей первого товара
        const goods = products.find((p) => String(p.type || '').toUpperCase() === 'GOODS') || products[0];
        log('warn', `iiko: КБЖУ-полей не видно. Ключи объекта: ${Object.keys(goods || {}).join(', ')}`);
      }
    }

    // Пищевая ценность на 100 г — из старого XML-справочника (в JSON её нет).
    let xmlNutr = new Map();
    try {
      const xml = await iiko.getProductsXml();
      xmlNutr = parseNutritionXml(xml);
      log('info', `iiko: пищевая ценность из XML — ${xmlNutr.size} позиций`);
      if (xmlNutr.size === 0 && typeof xml === 'string') {
        const first = (xml.split(/<productDto[\s>]/)[1] || '').slice(0, 700);
        log('warn', `iiko: XML не распознан. Начало первого <productDto>: ${first}`);
      }
    } catch (e) {
      log('warn', `iiko: XML-справочник недоступен (${String(e?.message || e).slice(0, 120)})`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const { assemblyCharts, preparedCharts } = await iiko.getAssemblyCharts(today, today);
    log('info', `iiko: техкарты на сегодня — ${assemblyCharts.length}, разложенные — ${preparedCharts.length}`);

    if (products.length && assemblyCharts.length === 0) {
      log('warn', 'iiko: техкарты не вернулись — проверьте права API-пользователя (нужен доступ к номенклатуре и техкартам)');
    }

    const P = new Map(); // id -> product
    for (const p of products) if (p && p.id != null) P.set(String(p.id), p);
    const per100 = new Map(); // id -> {protein,fat,carbs,kcal} на 100 г
    for (const p of products) {
      if (!p || p.id == null) continue;
      const id = String(p.id);
      per100.set(id, xmlNutr.get(id) || nutritionPer100g(p));
    }

    // группируем карты по продукту
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
    let nutrFull = 0;
    let nutrPartial = 0;

    for (const [pid, p] of P) {
      const type = String(p.type || p.productType || '').toUpperCase();
      const aCharts = groupA.get(pid);
      if (type && type !== 'DISH' && type !== 'PREPARED' && !aCharts) continue;
      if (!aCharts && !groupP.get(pid)) continue;
      dishCount++;

      // --- состав: человекочитаемый список ингредиентов ---
      const aChart = aCharts && pickChart(aCharts, today);
      const pCh = groupP.get(pid) && pickChart(groupP.get(pid), today);
      // по умолчанию — разложенная карта (базовое сырьё), иначе прямая
      const compChart = compSource === 'direct' ? aChart || pCh : pCh || aChart;
      let composition = '';
      if (compChart) {
        const acc = new Map(); // cleanName -> {name, kg}
        for (const it of chartItems(compChart)) {
          const ing = P.get(String(itemProductId(it)));
          let nm = ing && (ing.name || ing.productName);
          if (!nm) continue;
          nm = cleanIngredient(nm);
          if (!nm) continue;
          const low = norm(nm);
          if (!low || excl.some((e) => low.includes(e))) continue;
          const kg = itemNetKg(it) || 0;
          const cur = acc.get(low);
          if (cur) cur.kg += kg;
          else acc.set(low, { name: nm, kg });
        }
        const list = [...acc.values()]
          .sort((a, b) => b.kg - a.kg)
          .slice(0, compMax)
          .map((x) => x.name);
        composition = list.join(', ');
        if (composition) compCount++;
      }

      // --- КБЖУ: по разложенной карте (только сырьё) ---
      let protein = 0;
      let fat = 0;
      let carbs = 0;
      let kcal = 0;
      let netG = 0;
      let anyN = false;
      let missN = false;
      const pCharts = groupP.get(pid);
      const pChart = pCharts && pickChart(pCharts, today);
      const src = pChart || aChart;
      if (src) {
        for (const it of chartItems(src)) {
          const kg = itemNetKg(it);
          if (kg > 0) netG += kg * 1000;
          const n = per100.get(String(itemProductId(it)));
          if (!n) {
            missN = true;
            continue;
          }
          const f = kg * 10; // кг*1000/100 -> множитель на «на 100 г»
          if (n.protein != null) { protein += n.protein * f; anyN = true; } else missN = true;
          if (n.fat != null) { fat += n.fat * f; anyN = true; } else missN = true;
          if (n.carbs != null) { carbs += n.carbs * f; anyN = true; } else missN = true;
          if (n.kcal != null) { kcal += n.kcal * f; anyN = true; } else missN = true;
        }
      }

      let out = { protein: null, fat: null, carbs: null, kcal: null };
      if (anyN) {
        if (basis === 'per100g' && netG > 0) {
          const k = 100 / netG;
          out = { protein: protein * k, fat: fat * k, carbs: carbs * k, kcal: kcal * k };
        } else {
          out = { protein, fat, carbs, kcal };
        }
        if (missN) nutrPartial++;
        else nutrFull++;
      }

      items.push({
        iikoId: pid,
        num: p.num != null ? String(p.num).trim() : null,
        code: p.code != null ? String(p.code).trim() : null,
        name: (p.name || p.productName || '').trim(),
        composition,
        protein: out.protein,
        fat: out.fat,
        carbs: out.carbs,
        kcal: out.kcal,
      });
    }

    const stats = {
      products: products.length,
      charts: assemblyCharts.length,
      dishes: dishCount,
      compositions: compCount,
      nutritionFull: nutrFull,
      nutritionPartial: nutrPartial,
    };
    log('info', `iiko: подготовлено ${items.length} позиций (состав ${compCount}, КБЖУ полн. ${nutrFull} / част. ${nutrPartial})`);

    const res = await pushToCloud('/sync/nomenclature', {
      method: 'POST',
      body: JSON.stringify({ items, stats, message: `iiko ${iiko.host}` }),
    });
    log('info', `Отправлено в облако: сопоставлено ${res.matched}, состав +${res.compositionSet}, КБЖУ +${res.nutritionSet}`);
    return res;
  } finally {
    await iiko.logout();
  }
}
