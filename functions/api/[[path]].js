import {
  getJSON,
  setJSON,
  listJobs,
  getJob,
  putJob,
  deleteJob,
  trimJobs,
  initStore,
} from '../_lib/store.js';
import { mergeSettings, SETTINGS_KEYS, DISH_EDITABLE } from '../../web/src/shared/defaults.js';
import { parseRows } from '../../web/src/shared/importParse.js';
import { parseKbjuRows } from '../../web/src/shared/parseKbju.js';
import {
  calculateLabelDateTime,
  DEFAULT_DATETIME_CONFIG,
  utcShiftedKey,
} from '../../web/src/shared/labelDateTime.js';
import {
  warningsForDish,
  warningObjects,
  pickBarcodeValue,
  normalizeDishForLabel,
  WARNING_TEXT,
} from '../../web/src/shared/normalize.js';


let ADMIN_TOKEN = '';
let AGENT_TOKEN = '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });

function tokenOf(req) {
  const h = req.headers.get('authorization') || '';
  return h.replace(/^Bearer\s+/i, '').trim() || (req.headers.get('x-api-key') || '').trim();
}
const isAdmin = (req) => !ADMIN_TOKEN || tokenOf(req) === ADMIN_TOKEN;
const isAgent = (req) => {
  const t = tokenOf(req);
  if (!AGENT_TOKEN && !ADMIN_TOKEN) return true;
  return t === AGENT_TOKEN || (ADMIN_TOKEN && t === ADMIN_TOKEN);
};
const denyAdmin = () => json({ error: 'Требуется токен администратора' }, 401);
const denyAgent = () => json({ error: 'Требуется токен агента' }, 401);

/* ----------------------------- данные ----------------------------- */

async function loadSettings() {
  return mergeSettings(await getJSON('settings', {}));
}
async function loadDishes() {
  return (await getJSON('dishes', [])) || [];
}

function dishOut(d, settings) {
  const bc = pickBarcodeValue(d, settings);
  return {
    ...d,
    active: !!d.active,
    barcodeValue: bc.value,
    barcodeSourceEffective: bc.source,
    warnings: warningObjects(d, settings),
  };
}

function toNum(v) {
  return v === '' || v == null ? null : Number(v);
}

function num1(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[«»"'`]/g, '')
    .replace(/[\s\-–—]+/g, ' ')
    .replace(/[.,;:()]+/g, '')
    .trim();
}

/* ----------------------------- маршрутизация ----------------------------- */

async function route(req) {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const seg = path.split('/').filter(Boolean); // e.g. ['dishes','12']
  const method = req.method.toUpperCase();
  let body = {};
  if (method === 'POST' || method === 'PUT') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  try {
    /* --- health --- */
    if (path === '/' || path === '/health') return json({ ok: true, ts: new Date().toISOString() });

    /* --- settings --- */
    if (seg[0] === 'settings') {
      if (method === 'GET') return json({ settings: await loadSettings() });
      if (method === 'PUT') {
        if (!isAdmin(req)) return denyAdmin();
        const stored = (await getJSON('settings', {})) || {};
        for (const [k, v] of Object.entries(body || {})) {
          if (k === 'datetime') stored.datetime = { ...DEFAULT_DATETIME_CONFIG, ...(stored.datetime || {}), ...v };
          else if (SETTINGS_KEYS.includes(k)) stored[k] = v;
        }
        await setJSON('settings', stored);
        await logEvent('info', 'settings', 'Обновлены настройки: ' + Object.keys(body || {}).join(', '));
        return json({ settings: mergeSettings(stored) });
      }
    }

    /* --- dishes --- */
    if (seg[0] === 'dishes') {
      const settings = await loadSettings();
      const dishes = await loadDishes();

      if (seg.length === 1 && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const onlyActive = url.searchParams.get('all') !== '1';
        let rows = [...dishes].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
        if (onlyActive) rows = rows.filter((r) => r.active);
        if (q)
          rows = rows.filter(
            (r) =>
              (r.name || '').toLowerCase().includes(q) ||
              (r.code || '').toLowerCase().includes(q) ||
              (r.artikul || '').toLowerCase().includes(q) ||
              (r.category || '').toLowerCase().includes(q)
          );
        const total = rows.length;
        const limit = Math.min(2000, Number(url.searchParams.get('limit')) || 1000);
        rows = rows.slice(0, limit);
        return json({ total, count: rows.length, dishes: rows.map((d) => dishOut(d, settings)) });
      }

      if (seg[1] === 'categories' && method === 'GET') {
        const cats = [...new Set(dishes.map((d) => d.category).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, 'ru')
        );
        return json({ categories: cats });
      }

      const id = Number(seg[1]);
      const idx = dishes.findIndex((d) => d.id === id);
      if (seg.length === 2 && method === 'GET') {
        if (idx < 0) return json({ error: 'Блюдо не найдено' }, 404);
        return json({ dish: dishOut(dishes[idx], settings) });
      }
      if (seg.length === 2 && method === 'PUT') {
        if (!isAdmin(req)) return denyAdmin();
        if (idx < 0) return json({ error: 'Блюдо не найдено' }, 404);
        const d = dishes[idx];
        for (const key of DISH_EDITABLE) {
          if (!(key in body)) continue;
          if (key === 'active') d.active = body[key] ? 1 : 0;
          else if (['kcal', 'protein', 'fat', 'carbs', 'shelf_life_hours'].includes(key))
            d[key] = toNum(body[key]);
          else d[key] = body[key];
        }
        if ('category' in body && !('category_source' in body)) d.category_source = 'manual';
        if ('composition' in body && !('composition_source' in body)) d.composition_source = 'manual';
        if (
          ['kcal', 'protein', 'fat', 'carbs'].some((k) => k in body) &&
          !('nutrition_source' in body)
        )
          d.nutrition_source = 'manual';
        d.updated_at = new Date().toISOString();
        await setJSON('dishes', dishes);
        await logEvent('info', 'dishes', `Отредактировано блюдо #${d.id} «${d.name}»`);
        return json({ dish: dishOut(d, settings) });
      }
    }

    /* --- import --- */
    if (seg[0] === 'import') {
      if (seg[1] === 'batches' && method === 'GET') {
        return json({ batches: (await getJSON('batches', [])) || [] });
      }

      // импорт КБЖУ отдельным файлом
      if (seg[1] === 'kbju' && method === 'POST') {
        if (!isAdmin(req)) return denyAdmin();
        const rows = body.rows;
        if (!Array.isArray(rows)) return json({ error: 'Ожидается { rows: [[...]] }' }, 400);
        let parsed;
        try {
          parsed = parseKbjuRows(rows);
        } catch (e) {
          return json({ error: String(e?.message || e) }, 400);
        }
        const dishes = await loadDishes();
        const byCode = new Map(dishes.filter((d) => d.code).map((d) => [String(d.code).trim(), d]));
        const byArt = new Map(dishes.filter((d) => d.artikul).map((d) => [String(d.artikul).trim(), d]));
        const now = new Date().toISOString();
        let matched = 0;
        let notFound = 0;
        for (const r of parsed.rows) {
          const d = (r.keyType === 'code' ? byCode.get(r.key) : byArt.get(r.key)) || byArt.get(r.key) || byCode.get(r.key);
          if (!d) {
            notFound++;
            continue;
          }
          d.protein = num1(r.protein);
          d.fat = num1(r.fat);
          d.carbs = num1(r.carbs);
          d.kcal = r.kcal == null ? null : Math.round(Number(r.kcal));
          d.nutrition_source = 'import';
          d.updated_at = now;
          matched++;
        }
        await setJSON('dishes', dishes);
        await logEvent('info', 'import', `Импорт КБЖУ «${body.filename || '—'}»: обновлено ${matched}, не найдено ${notFound}`);
        return json({ ok: true, received: parsed.rows.length, matched, notFound, columns: parsed.columns });
      }
      if (seg.length === 1 && method === 'POST') {
        if (!isAdmin(req)) return denyAdmin();
        const rows = body.rows;
        if (!Array.isArray(rows)) return json({ error: 'Ожидается { rows: [[...]] }' }, 400);
        const parsed = parseRows(rows);
        const dishes = await loadDishes();
        const byCode = new Map(dishes.filter((d) => d.code).map((d) => [d.code, d]));
        const byArt = new Map(dishes.filter((d) => d.artikul).map((d) => [d.artikul, d]));
        let nextId = dishes.reduce((m, d) => Math.max(m, d.id || 0), 0) + 1;
        const now = new Date().toISOString();
        const batchId = Date.now();
        let created = 0;
        let updated = 0;

        for (const s of parsed.dishes) {
          const ex = (s.code && byCode.get(s.code)) || (s.artikul && byArt.get(s.artikul)) || null;
          if (ex) {
            Object.assign(ex, {
              name: s.name,
              artikul: s.artikul,
              code: s.code,
              type: 'Блюдо',
              unit: s.unit,
              price: s.price,
              cost: s.cost,
              cost_pct: s.cost_pct,
              sale_places: s.sale_places,
              cook_time_norm: s.cook_time_norm,
              cook_time_peak: s.cook_time_peak,
              raw_row: s.raw_row,
              import_batch_id: batchId,
              updated_at: now,
            });
            if (ex.category_source !== 'manual') {
              ex.category = s.category;
              ex.category_source = s.category_source;
            }
            updated++;
          } else {
            const rec = {
              id: nextId++,
              ...s,
              composition: null,
              composition_source: null,
              kcal: null,
              protein: null,
              fat: null,
              carbs: null,
              nutrition_source: null,
              shelf_life_hours: null,
              storage_text: null,
              barcode_source: null,
              active: 1,
              import_batch_id: batchId,
              created_at: now,
              updated_at: now,
            };
            dishes.push(rec);
            if (rec.code) byCode.set(rec.code, rec);
            if (rec.artikul) byArt.set(rec.artikul, rec);
            created++;
          }
        }
        await setJSON('dishes', dishes);

        const batches = (await getJSON('batches', [])) || [];
        const summary = {
          id: batchId,
          filename: body.filename || null,
          imported_at: now,
          rows_total: parsed.rowsTotal,
          dishes_new: created,
          dishes_upd: updated,
          groups_count: parsed.groups.length,
          skipped_count: parsed.skipped,
        };
        batches.unshift(summary);
        await setJSON('batches', batches.slice(0, 50));
        await logEvent(
          'info',
          'import',
          `Импорт «${body.filename || '—'}»: +${created} новых, ~${updated} обновлено`
        );

        return json({
          ...summary,
          batchId,
          dishesNew: created,
          dishesUpdated: updated,
          dishesTotal: parsed.dishes.length,
          groups: parsed.groups,
          groupsCount: parsed.groups.length,
          skipped: parsed.skipped,
          noCategoryCount: parsed.dishes.filter((d) => d.category_source === 'none').length,
          uncertainCategoryCount: parsed.dishes.filter((d) => d.category_source === 'uncertain').length,
        });
      }
    }

    /* --- label datetime --- */
    if (path === '/label/datetime' && method === 'GET') {
      const settings = await loadSettings();
      const local = url.searchParams.get('local') || utcShiftedKey(settings.datetime.tzOffsetMin);
      const dt = calculateLabelDateTime(local, settings.datetime);
      return json({ now: local, ...dt, config: settings.datetime });
    }

    /* --- print --- */
    if (path === '/print' && method === 'POST') {
      const settings = await loadSettings();
      const dishes = await loadDishes();
      const dish = dishes.find((d) => d.id === Number(body.dishId));
      if (!dish) return json({ ok: false, error: 'Блюдо не найдено' }, 404);

      const quantity = Math.max(1, Math.min(999, Number(body.quantity) || 1));
      const warns = warningsForDish(dish, settings);
      if (warns.length && !body.ignoreWarnings) {
        return json(
          { ok: false, needsConfirm: true, warnings: warns.map((c) => ({ code: c, text: WARNING_TEXT[c] })) },
          409
        );
      }
      const local = body.clientLocal || utcShiftedKey(settings.datetime.tzOffsetMin);
      const dt = calculateLabelDateTime(local, settings.datetime);
      const job = await enqueueJob({
        kind: 'label',
        quantity,
        user: body.user || 'kitchen',
        dish: { id: dish.id, name: dish.name, code: dish.code, artikul: dish.artikul },
        label: normalizeDishForLabel(dish, settings, dt),
        render: renderParams(settings),
        labelDate: dt.date,
        labelTime: dt.time,
        approximateTime: dt.approximate,
      });
      await logEvent('info', 'print', `Задание #${job.id}: ${dish.name} ×${quantity}`);
      return json({
        ok: true,
        jobId: job.id,
        status: job.status,
        labelDate: dt.date,
        labelTime: dt.time,
        approximateTime: dt.approximate,
        warnings: warns.map((c) => ({ code: c, text: WARNING_TEXT[c] })),
      });
    }

    if (path === '/print/test' && method === 'POST') {
      if (!isAdmin(req)) return denyAdmin();
      const settings = await loadSettings();
      const job = await enqueueJob({
        kind: 'test',
        quantity: Math.max(1, Math.min(10, Number(body.copies) || 1)),
        user: body.user || 'admin',
        dish: { name: '[ТЕСТОВАЯ ПЕЧАТЬ]' },
        render: renderParams(settings),
        labelDate: '',
        labelTime: '',
      });
      await logEvent('info', 'print', `Тестовая печать, задание #${job.id}`);
      return json({ ok: true, jobId: job.id, status: job.status });
    }

    /* --- синхронизация с iiko --- */
    if (seg[0] === 'sync') {
      if (seg[1] === 'status' && method === 'GET') {
        const s = await loadSettings();
        return json({
          enabled: s['sync.enabled'] !== false,
          everyHours: Number(s['sync.everyHours']) || 6,
          lastRunAt: s['sync.lastRunAt'] || null,
          lastResult: s['sync.lastResult'] || null,
        });
      }
      if (seg[1] === 'run' && method === 'POST') {
        if (!isAdmin(req)) return denyAdmin();
        const job = await enqueueJob({ kind: 'sync', user: body.user || 'admin', dish: { name: '[СИНХРОНИЗАЦИЯ iiko]' } });
        await logEvent('info', 'sync', `Запрошена синхронизация, задание #${job.id}`);
        return json({ ok: true, jobId: job.id });
      }
      // агент присылает вычисленные состав + КБЖУ
      if (seg[1] === 'nomenclature' && method === 'POST') {
        if (!isAgent(req)) return denyAgent();
        const items = Array.isArray(body.items) ? body.items : [];
        const s0 = (await getJSON('settings', {})) || {};
        const settings = mergeSettings(s0);
        const allowNew = settings['sync.allowNewDishes'] === true;
        const dishes = await loadDishes();
        const byArt = new Map(dishes.filter((d) => d.artikul).map((d) => [String(d.artikul), d]));
        const byCode = new Map(dishes.filter((d) => d.code).map((d) => [String(d.code), d]));
        const byName = new Map(dishes.map((d) => [normName(d.name), d]));
        let nextId = dishes.reduce((m, d) => Math.max(m, d.id || 0), 0) + 1;
        const now = new Date().toISOString();

        let matched = 0;
        let compSet = 0;
        let nutrSet = 0;
        let nutrPartial = 0;
        let added = 0;

        for (const it of items) {
          const key = String(it.num || '').trim();
          let d =
            (key && byArt.get(key)) ||
            (it.code && byCode.get(String(it.code))) ||
            (it.name && byName.get(normName(it.name))) ||
            null;

          if (!d) {
            if (!allowNew || !it.name) continue;
            d = {
              id: nextId++,
              name: it.name,
              artikul: key || null,
              code: it.code ? String(it.code) : null,
              type: 'Блюдо',
              category: null,
              category_source: 'none',
              composition: null,
              composition_source: null,
              kcal: null,
              protein: null,
              fat: null,
              carbs: null,
              nutrition_source: null,
              barcode_source: null,
              active: 1,
              created_at: now,
              updated_at: now,
            };
            dishes.push(d);
            if (d.artikul) byArt.set(String(d.artikul), d);
            added++;
          }
          matched++;
          d.iiko_id = it.iikoId || d.iiko_id || null;
          d.iiko_synced_at = now;

          if (it.composition && d.composition_source !== 'manual') {
            if (d.composition !== it.composition) {
              d.composition = it.composition;
              d.composition_source = 'iiko';
              compSet++;
            }
          }

          const hasFull =
            it.protein != null && it.fat != null && it.carbs != null && it.kcal != null;
          const hasAny = it.protein != null || it.fat != null || it.carbs != null || it.kcal != null;
          const nutrLocked = d.nutrition_source === 'manual' || d.nutrition_source === 'import';
          if (hasAny && !nutrLocked) {
            d.protein = num1(it.protein);
            d.fat = num1(it.fat);
            d.carbs = num1(it.carbs);
            d.kcal = it.kcal == null ? null : Math.round(Number(it.kcal));
            d.nutrition_source = hasFull ? 'iiko-computed' : 'iiko-partial';
            if (hasFull) nutrSet++;
            else nutrPartial++;
          }
          d.updated_at = now;
        }

        await setJSON('dishes', dishes);
        const result = {
          ok: true,
          at: now,
          received: items.length,
          matched,
          added,
          compositionSet: compSet,
          nutritionSet: nutrSet,
          nutritionPartial: nutrPartial,
          message: body.message || null,
          agentStats: body.stats || null,
        };
        s0['sync.lastRunAt'] = now;
        s0['sync.lastResult'] = result;
        await setJSON('settings', s0);
        await logEvent(
          'info',
          'sync',
          `iiko: получено ${items.length}, сопоставлено ${matched}, состав +${compSet}, КБЖУ +${nutrSet} (частично ${nutrPartial}), новых ${added}`
        );
        return json(result);
      }
    }

    /* --- history --- */
    if (path === '/history' && method === 'GET') {
      const limit = Math.min(1000, Number(url.searchParams.get('limit')) || 200);
      return json({ jobs: (await listJobs()).slice(0, limit) });
    }

    /* --- logs --- */
    if (path === '/logs') {
      if (method === 'GET') {
        const logs = (await getJSON('logs', [])) || [];
        const level = url.searchParams.get('level');
        return json({ logs: level ? logs.filter((l) => l.level === level) : logs });
      }
      if (method === 'DELETE') {
        if (!isAdmin(req)) return denyAdmin();
        await setJSON('logs', []);
        return json({ ok: true });
      }
    }

    /* --- agent: регистрация и список принтеров --- */
    if (seg[0] === 'agent') {
      if (seg[1] === 'hello' && method === 'POST') {
        if (!isAgent(req)) return denyAgent();
        await setJSON('agent-info', {
          agent: body.agent || 'agent',
          platform: body.platform || null,
          printers: Array.isArray(body.printers) ? body.printers : [],
          version: body.version || null,
          at: new Date().toISOString(),
        });
        return json({ ok: true });
      }
      if (seg[1] === 'info' && method === 'GET') {
        const info = await getJSON('agent-info', null);
        let online = false;
        if (info?.at) online = Date.now() - new Date(info.at).getTime() < 30000;
        return json({ agent: info, online });
      }
    }

    /* --- agent: очередь заданий --- */
    if (seg[0] === 'jobs') {
      if (!isAgent(req)) return denyAgent();

      if (seg.length === 1 && method === 'GET') {
        const status = url.searchParams.get('status') || 'queued';
        return json({ jobs: (await listJobs()).filter((j) => j.status === status) });
      }
      const id = Number(seg[1]);
      const job = await getJob(id);
      if (!job) return json({ error: 'Задание не найдено' }, 404);

      if (seg[2] === 'claim' && method === 'POST') {
        if (job.status !== 'queued')
          return json({ error: 'Задание уже в работе', status: job.status }, 409);
        job.status = 'printing';
        job.claimedAt = new Date().toISOString();
        job.agent = body.agent || 'agent';
        await putJob(job);
        return json({ job });
      }
      if (seg[2] === 'complete' && method === 'POST') {
        job.status = body.ok ? (body.via === 'dry-run' ? 'dry-run' : 'success') : 'error';
        job.finishedAt = new Date().toISOString();
        job.via = body.via || null;
        job.error = body.error || null;
        await putJob(job);
        await logEvent(
          body.ok ? 'info' : 'error',
          'print',
          `Задание #${job.id} (${job.dish?.name || ''}) → ${job.status}` + (body.error ? `: ${body.error}` : '')
        );
        await trimJobs(200);
        return json({ ok: true, job });
      }
      if (method === 'DELETE') {
        await deleteJob(id);
        return json({ ok: true });
      }
    }

    return json({ error: 'Не найдено', path }, 404);
  } catch (e) {
    await logEvent('error', 'api', `${method} ${path}: ${e?.message || e}`, String(e?.stack || ''));
    return json({ error: String(e?.message || e) }, 500);
  }
}

/* ----------------------------- helpers ----------------------------- */

function renderParams(settings) {
  return {
    widthMm: Number(settings['label.widthMm']) || 100,
    heightMm: Number(settings['label.heightMm']) || 70,
    dpi: Number(settings['label.dpi']) || 300,
    printRotationDeg: Number(settings['label.printRotationDeg']) || 0,
    safeMm: Number(settings['label.safeMm']) || 3,
    useTemplate: settings['label.useTemplate'] !== false,
    copiesMode: settings['print.copiesMode'] || 'pages',
    scale: settings['print.scale'] || 'noscale',
    printerName: settings['printer.name'] || '',
    dryRun: !!settings['printer.dryRun'],
    symbology: settings['barcode.symbology'] || 'code128',
    showText: settings['barcode.showText'] !== false,
    brandColor: settings['brand.primaryColor'] || '#F2661F',
  };
}

async function enqueueJob(partial) {
  const job = {
    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
    status: 'queued',
    ...partial,
  };
  await putJob(job);
  return job;
}

async function logEvent(level, context, message, detail) {
  try {
    const logs = (await getJSON('logs', [])) || [];
    logs.unshift({
      id: Date.now() + Math.random(),
      created_at: new Date().toISOString(),
      level,
      context,
      message,
      detail: detail || null,
    });
    await setJSON('logs', logs.slice(0, 500));
  } catch {
    /* no-op */
  }
}

/* --- Cloudflare Pages Functions entrypoint --- */
export async function onRequest(context) {
  initStore(context.env);
  ADMIN_TOKEN = context.env.GOFOOD_TOKEN || '';
  AGENT_TOKEN = context.env.GOFOOD_AGENT_TOKEN || '';
  return route(context.request);
}
