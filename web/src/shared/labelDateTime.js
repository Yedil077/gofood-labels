/**
 * Бизнес-логика даты/времени на этикетке.  Изолирована от UI, БД и сети.
 *
 * ВАЖНО (ТЗ п.6):
 *  - ДАТА выводится из 6 контрольных примеров однозначно:
 *      смена «катится» в следующий календарный день в 09:00.
 *  - ВРЕМЯ из 6 примеров ОДНОЗНАЧНО НЕ ВЫВОДИТСЯ (09:00 03.09 → 00:12,
 *      но 09:00 04.09 → 01:00; скорость роста нелинейна) → формула НЕ придумывается.
 *    Механизм: 1) таблица контрольных примеров (точное совпадение → точный вывод);
 *              2) параметры вынесены в настройки администратора;
 *              3) для прочих моментов время берётся из timeFallback и помечается approximate.
 */

export const DEFAULT_DATETIME_CONFIG = {
  shiftCutoffMin: 9 * 60,
  shelfLifeHours: 24,
  // Смещение времени кухни от UTC, минуты (Алматы = +300). Используется ТОЛЬКО когда
  // фактическое локальное время не передано клиентом (напр. тестовая печать агентом).
  tzOffsetMin: 300,
  controlExamples: [
    { in: '2026-09-03 09:00', out: '2026-09-04 00:12' },
    { in: '2026-09-03 23:59', out: '2026-09-04 00:13' },
    { in: '2026-09-04 01:55', out: '2026-09-04 01:01' },
    { in: '2026-09-04 01:56', out: '2026-09-04 01:02' },
    { in: '2026-09-04 08:59', out: '2026-09-04 01:30' },
    { in: '2026-09-04 09:00', out: '2026-09-05 01:00' },
  ],
  // 'passthrough' — реальное время печати; 'fixed' — всегда valueMin
  timeFallback: { mode: 'passthrough', valueMin: 0 },
};

const pad2 = (n) => String(n).padStart(2, '0');

export function localKey(d) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

function parseLocal(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
}

const fmtDate = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** "YYYY-MM-DD HH:mm" для момента (UTC + смещение), когда локальное время клиента недоступно. */
export function utcShiftedKey(offsetMin = 0, d = new Date()) {
  const s = new Date(d.getTime() + offsetMin * 60000);
  return (
    `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())} ` +
    `${pad2(s.getUTCHours())}:${pad2(s.getUTCMinutes())}`
  );
}

/**
 * @param {Date|string} currentDateTime
 * @param {object} [config]
 * @returns {{date:string,time:string,iso:string,approximate:boolean,ruleId:string}}
 */
export function calculateLabelDateTime(currentDateTime, config = {}) {
  const cfg = { ...DEFAULT_DATETIME_CONFIG, ...config };
  const now =
    currentDateTime instanceof Date
      ? currentDateTime
      : parseLocal(currentDateTime) || new Date(currentDateTime);

  const key = localKey(now);
  const hit = (cfg.controlExamples || []).find((e) => e.in === key);
  if (hit) {
    const out = parseLocal(hit.out);
    return { date: fmtDate(out), time: fmtTime(out), iso: out.toISOString(), approximate: false, ruleId: 'control' };
  }

  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  const labelDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  // dateMode: 'shift' — после cutoff катим на след. день; 'today' — всегда текущая дата
  if ((cfg.dateMode || 'shift') === 'shift' && minutesOfDay >= cfg.shiftCutoffMin) {
    labelDate.setDate(labelDate.getDate() + 1);
  }

  const fb = cfg.timeFallback || DEFAULT_DATETIME_CONFIG.timeFallback;
  let hh = 0;
  let mm = 0;
  const passthrough = fb.mode === 'passthrough';
  if (passthrough) {
    hh = now.getHours();
    mm = now.getMinutes();
  } else {
    const v = Number.isFinite(fb.valueMin) ? fb.valueMin : 0;
    hh = Math.floor(v / 60) % 24;
    mm = v % 60;
  }
  labelDate.setHours(hh, mm, 0, 0);

  return {
    date: fmtDate(labelDate),
    time: fmtTime(labelDate),
    iso: labelDate.toISOString(),
    // passthrough = реальное время, это точный ответ; fixed = заглушка
    approximate: !passthrough,
    ruleId: passthrough ? 'realtime' : 'fallback',
  };
}

export default calculateLabelDateTime;
