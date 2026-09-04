import {
  Iiko,
  nutritionPer100g,
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
  const excl = (settings['sync.excludeIngredients'] || []).map(norm).filter(Boolean);
  const basis = settings['sync.nutritionBasis'] || 'portion';

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
      log('warn', 'iiko: ни у одной позиции не считались поля ценности — пришлите один объект products в поддержку, подстрою имена полей');
    }

    const today = new Date().toISOString().slice(0, 10);
    const { assemblyCharts, preparedCharts } = await iiko.getAssemblyCharts(today, today);
    log('info', `iiko: техкарты на сегодня — ${assemblyCharts.length}, разложенные — ${preparedCharts.length}`);

    if (products.length && assemblyCharts.length === 0) {
      log('warn', 'iiko: техкарты не вернулись — проверьте права API-пользователя (нужен доступ к номенклатуре и техкартам)');
    }

    const P = new Map(); // id -> product
    for (const p of products) if (p && p.id != null) P.set(String(p.id), p);
    const per100 = new Map(); // id -> {protein,fat,carbs,kcal}
    for (const p of products) if (p && p.id != null) per100.set(String(p.id), nutritionPer100g(p));

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

      // --- состав: прямые ингредиенты техкарты (как в верхней таблице карточки) ---
      let composition = '';
      const aChart = aCharts && pickChart(aCharts, today);
      if (aChart) {
        const names = [];
        for (const it of chartItems(aChart)) {
          const ing = P.get(String(itemProductId(it)));
          const nm = ing && (ing.name || ing.productName);
          if (!nm) continue;
          const low = norm(nm);
          if (excl.some((e) => low.includes(e))) continue;
          if (!names.some((x) => norm(x) === low)) names.push(String(nm).trim());
        }
        composition = names.join(', ');
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

    const res = await pushToCloud('/api/sync/nomenclature', {
      method: 'POST',
      body: JSON.stringify({ items, stats, message: `iiko ${iiko.host}` }),
    });
    log('info', `Отправлено в облако: сопоставлено ${res.matched}, состав +${res.compositionSet}, КБЖУ +${res.nutritionSet}`);
    return res;
  } finally {
    await iiko.logout();
  }
}
