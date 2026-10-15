/**
 * Централизованная очередь печати (таблица D1 `print_jobs`).
 *
 * Работает с любым объектом с API Cloudflare D1: db.prepare(sql).bind(...).run()/first()/all().
 * В тестах — тот же код поверх node:sqlite.
 *
 * Статусы:
 *   queued     — в очереди
 *   sending    — агент взял задание, готовит и передаёт принтеру
 *   printing   — Windows-спулер сообщает, что задание печатается
 *   done       — спулер полностью передал задание принтеру (физический выход наклеек
 *                принтер не подтверждает — это лучшее доступное подтверждение)
 *   sent       — передано в Windows, отследить спулер не удалось
 *   error      — ошибка
 *   cancelled  — отменено до отправки
 *   uncertain  — связь потеряна ПОСЛЕ отправки принтеру: напечатано или нет — неизвестно,
 *                автоматически НЕ повторяется (иначе дубликаты), только вручную
 *   browser    — запись о печати через браузер (только история)
 *
 * Гарантии:
 *  - FIFO по queued_at, id;
 *  - захват следующего задания — ОДИН SQL-оператор: берёт самое старое queued, только если
 *    сейчас нет задания в работе (sending/printing) — два агента не напечатают параллельно;
 *  - любые переходы — условные UPDATE (WHERE status=…, agent=…): двойная отправка невозможна;
 *  - зависшие задания: до отправки принтеру → обратно в очередь; после → uncertain.
 */

export const QUEUE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS print_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'label',
    status TEXT NOT NULL,
    dish_id INTEGER,
    dish_name TEXT,
    filled INTEGER NOT NULL DEFAULT 1,
    blank INTEGER NOT NULL DEFAULT 0,
    label_size TEXT,
    variant TEXT,
    label_date TEXT,
    label_time TEXT,
    payload TEXT,
    user TEXT,
    agent TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    claimed_at TEXT,
    submitted_at TEXT,
    heartbeat_at TEXT,
    finished_at TEXT,
    hidden INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs (status, queued_at, id)`,
  `CREATE INDEX IF NOT EXISTS idx_print_jobs_created ON print_jobs (created_at)`,
];

export const ACTIVE = ['sending', 'printing'];
export const STALE_MS = 90 * 1000; // нет сигнала от агента дольше — задание «зависло»
export const MAX_AUTO_ATTEMPTS = 3; // автоповтор только для ошибок ДО отправки принтеру

/** @type {Record<string, string>} */
export const STATUS_TEXT = {
  queued: 'В очереди',
  sending: 'Передаётся принтеру',
  printing: 'Печатается',
  done: 'Завершено',
  sent: 'Передано в Windows',
  error: 'Ошибка',
  cancelled: 'Отменено',
  uncertain: 'Неизвестно — проверьте',
  browser: 'Через браузер',
};

const iso = (t) => new Date(t).toISOString();
const newId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();

const schemaReady = new WeakSet();
export async function ensureQueueSchema(db) {
  if (schemaReady.has(db)) return;
  for (const sql of QUEUE_SCHEMA) await db.prepare(sql).run();
  schemaReady.add(db);
}

function rowOut(r) {
  if (!r) return null;
  let payload = null;
  try {
    payload = r.payload ? JSON.parse(r.payload) : null;
  } catch {
    payload = null;
  }
  return { ...r, payload, hidden: !!r.hidden };
}
const changes = (res) => Number(res?.meta?.changes ?? res?.changes ?? 0);

/** Поставить задание в очередь (или записать браузерную печать, status='browser'). */
export async function enqueue(db, job, now = Date.now()) {
  await ensureQueueSchema(db);
  const id = job.id || newId();
  const t = iso(now);
  const status = job.status || 'queued';
  await db
    .prepare(
      `INSERT INTO print_jobs (id, kind, status, dish_id, dish_name, filled, blank, label_size, variant,
         label_date, label_time, payload, user, created_at, queued_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      id,
      job.kind || 'label',
      status,
      job.dishId ?? null,
      job.dishName ?? null,
      Math.max(1, Number(job.filled) || 1),
      Math.max(0, Number(job.blank) || 0),
      job.labelSize ?? null,
      job.variant ?? null,
      job.labelDate ?? null,
      job.labelTime ?? null,
      job.payload ? JSON.stringify(job.payload) : null,
      job.user ?? null,
      t,
      t,
      status === 'queued' ? null : t
    )
    .run();
  return getJob(db, id);
}

export async function getJob(db, id) {
  await ensureQueueSchema(db);
  return rowOut(await db.prepare('SELECT * FROM print_jobs WHERE id = ?').bind(id).first());
}

/** Зависшие задания (агент молчит дольше STALE_MS). */
export async function recoverStale(db, now = Date.now(), staleMs = STALE_MS) {
  await ensureQueueSchema(db);
  const cut = iso(now - staleMs);
  const t = iso(now);
  // ещё не отправлено принтеру — безопасно вернуть в очередь (на своё место)
  const a = await db
    .prepare(
      `UPDATE print_jobs SET status='queued', agent=NULL, claimed_at=NULL, heartbeat_at=NULL,
         note='агент пропал до отправки — задание возвращено в очередь'
       WHERE status='sending' AND submitted_at IS NULL AND heartbeat_at < ?`
    )
    .bind(cut)
    .run();
  // уже передано принтеру — результат неизвестен, повторять автоматически нельзя
  const b = await db
    .prepare(
      `UPDATE print_jobs SET status='uncertain', finished_at=?,
         error='Связь с агентом потеряна после отправки на принтер. Проверьте, напечатано ли, и при необходимости нажмите «Повторить».'
       WHERE status IN ('sending','printing') AND submitted_at IS NOT NULL AND heartbeat_at < ?`
    )
    .bind(t, cut)
    .run();
  return { requeued: changes(a), uncertain: changes(b) };
}

/** Агент перезапустился: всё «его» незавершённое разбираем сразу, не дожидаясь таймаута. */
export async function recoverAgent(db, agent, now = Date.now()) {
  await ensureQueueSchema(db);
  const t = iso(now);
  const a = await db
    .prepare(
      `UPDATE print_jobs SET status='queued', agent=NULL, claimed_at=NULL, heartbeat_at=NULL,
         note='агент перезапущен до отправки — задание возвращено в очередь'
       WHERE agent=? AND status='sending' AND submitted_at IS NULL`
    )
    .bind(agent)
    .run();
  const b = await db
    .prepare(
      `UPDATE print_jobs SET status='uncertain', finished_at=?,
         error='Агент перезапущен во время печати. Проверьте, напечатано ли, и при необходимости нажмите «Повторить».'
       WHERE agent=? AND status IN ('sending','printing') AND submitted_at IS NOT NULL`
    )
    .bind(t, agent)
    .run();
  return { requeued: changes(a), uncertain: changes(b) };
}

/** Размер задания (старые записи без размера — основной формат 80×50). */
export const DEFAULT_SIZE = '80x50';

/**
 * Атомарно взять следующее задание. Возвращает { job } | { busy: job } | { empty: true }.
 * Один оператор UPDATE…RETURNING: берёт самое старое queued только если нет задания в работе.
 * opts.labelSize — брать только задания под установленный рулон (FIFO внутри этого размера);
 * задания других размеров остаются в очереди и ждут замены рулона.
 */
export async function claimNext(db, agent, now = Date.now(), opts = {}) {
  await ensureQueueSchema(db);
  await recoverStale(db, now);
  const t = iso(now);
  const size = opts.labelSize ? String(opts.labelSize) : null;
  const row = await db
    .prepare(
      `UPDATE print_jobs SET status='sending', agent=?1, claimed_at=?2, heartbeat_at=?2,
         attempts=attempts+1, error=NULL
       WHERE id = (SELECT id FROM print_jobs
                   WHERE status='queued' AND (?3 IS NULL OR COALESCE(label_size, '${DEFAULT_SIZE}') = ?3)
                   ORDER BY queued_at, id LIMIT 1)
         AND status='queued'
         AND NOT EXISTS (SELECT 1 FROM print_jobs WHERE status IN ('sending','printing'))
       RETURNING *`
    )
    .bind(agent, t, size)
    .first();
  if (row) return { job: rowOut(row) };
  const busy = await db
    .prepare(`SELECT * FROM print_jobs WHERE status IN ('sending','printing') ORDER BY claimed_at LIMIT 1`)
    .first();
  if (busy) return { busy: rowOut(busy) };
  return { empty: true };
}

/** Агент сообщает о ходе: 'submitted' (сейчас отдаёт принтеру), 'printing', 'heartbeat'. */
export async function progress(db, id, agent, stage, now = Date.now()) {
  await ensureQueueSchema(db);
  const t = iso(now);
  const SQL = {
    submitted: `UPDATE print_jobs SET submitted_at=?1, heartbeat_at=?1 WHERE id=?2 AND agent=?3 AND status='sending'`,
    printing: `UPDATE print_jobs SET status='printing', heartbeat_at=?1, submitted_at=COALESCE(submitted_at, ?1)
               WHERE id=?2 AND agent=?3 AND status IN ('sending','printing')`,
    heartbeat: `UPDATE print_jobs SET heartbeat_at=?1 WHERE id=?2 AND agent=?3 AND status IN ('sending','printing')`,
  };
  const res = await db.prepare(SQL[stage] || SQL.heartbeat).bind(t, id, agent).run();
  return changes(res) === 1;
}

/**
 * Итог от агента. result: 'done' | 'sent' | 'error' | 'uncertain'.
 * retryable=true — ошибка ДО отправки принтеру (рендер, сеть): задание возвращается в
 * очередь на своё место, пока attempts < MAX_AUTO_ATTEMPTS.
 */
export async function complete(db, id, agent, { result, error = null, note = null, retryable = false }, now = Date.now()) {
  await ensureQueueSchema(db);
  const t = iso(now);
  const job = await getJob(db, id);
  if (!job || job.agent !== agent || !ACTIVE.includes(job.status)) return { ok: false, reason: 'not-owner' };
  if (result === 'error' && retryable && !job.submitted_at && job.attempts < MAX_AUTO_ATTEMPTS) {
    const r = await db
      .prepare(
        `UPDATE print_jobs SET status='queued', agent=NULL, claimed_at=NULL, heartbeat_at=NULL, error=?, note=?
         WHERE id=? AND agent=? AND status='sending' AND submitted_at IS NULL`
      )
      .bind(error, `автоповтор: попытка ${job.attempts} из ${MAX_AUTO_ATTEMPTS}`, id, agent)
      .run();
    return { ok: changes(r) === 1, requeued: true };
  }
  const status = ['done', 'sent', 'uncertain'].includes(result) ? result : 'error';
  const r = await db
    .prepare(
      `UPDATE print_jobs SET status=?, error=?, note=COALESCE(?, note), finished_at=?, heartbeat_at=?
       WHERE id=? AND agent=? AND status IN ('sending','printing')`
    )
    .bind(status, error, note, t, t, id, agent)
    .run();
  return { ok: changes(r) === 1, status };
}

/** Отменить можно только то, что ещё не передано агенту. */
export async function cancel(db, id, now = Date.now()) {
  await ensureQueueSchema(db);
  const r = await db
    .prepare(`UPDATE print_jobs SET status='cancelled', finished_at=? WHERE id=? AND status='queued'`)
    .bind(iso(now), id)
    .run();
  return changes(r) === 1;
}

/** Запись «Через браузер», которая на деле не печаталась (закрыли окно печати), — отменить. */
export async function voidBrowser(db, id, now = Date.now()) {
  await ensureQueueSchema(db);
  const r = await db
    .prepare(
      `UPDATE print_jobs SET status='cancelled', finished_at=?, note='отмечено: не печаталось (через браузер)'
       WHERE id=? AND status='browser'`
    )
    .bind(iso(now), id)
    .run();
  return changes(r) === 1;
}

/** Ручной повтор: ошибка / неизвестно / отменено → в конец очереди. */
export async function retry(db, id, now = Date.now()) {
  await ensureQueueSchema(db);
  const r = await db
    .prepare(
      `UPDATE print_jobs SET status='queued', queued_at=?, agent=NULL, claimed_at=NULL, submitted_at=NULL,
         heartbeat_at=NULL, finished_at=NULL, error=NULL, attempts=0, hidden=0, note='повтор вручную'
       WHERE id=? AND status IN ('error','uncertain','cancelled','sent')`
    )
    .bind(iso(now), id)
    .run();
  return changes(r) === 1;
}

/** Убрать завершённые/отменённые с экрана очереди (в истории остаются). */
export async function hideFinished(db) {
  await ensureQueueSchema(db);
  const r = await db
    .prepare(`UPDATE print_jobs SET hidden=1 WHERE hidden=0 AND status IN ('done','sent','cancelled')`)
    .run();
  return changes(r);
}

/** Очередь для экрана: всё активное + нескрытые завершённые за последние сутки. */
export async function listQueue(db, now = Date.now()) {
  await ensureQueueSchema(db);
  const since = iso(now - 24 * 3600 * 1000);
  const { results } = await db
    .prepare(
      `SELECT * FROM print_jobs
       WHERE status <> 'browser' AND hidden = 0
         AND (status IN ('queued','sending','printing','uncertain','error') OR created_at >= ?)
       ORDER BY CASE WHEN status IN ('queued','sending','printing') THEN 0 ELSE 1 END,
                CASE WHEN status IN ('queued','sending','printing') THEN queued_at END ASC,
                created_at DESC
       LIMIT 300`
    )
    .bind(since)
    .all();
  return (results || []).map(rowOut);
}

/** Задание, которое сейчас в работе у агента (или null). */
export async function activeJob(db) {
  await ensureQueueSchema(db);
  return rowOut(
    await db.prepare(`SELECT * FROM print_jobs WHERE status IN ('sending','printing') ORDER BY claimed_at LIMIT 1`).first()
  );
}

export async function pendingCount(db) {
  await ensureQueueSchema(db);
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM print_jobs WHERE status IN ('queued','sending','printing')`)
    .first();
  return Number(r?.n || 0);
}

/** История (все записи, новые сверху). */
export async function listHistory(db, limit = 500) {
  await ensureQueueSchema(db);
  const { results } = await db
    .prepare(`SELECT * FROM print_jobs ORDER BY created_at DESC LIMIT ?`)
    .bind(Math.max(1, Math.min(2000, limit)))
    .all();
  return (results || []).map(rowOut);
}

/** Строка очереди → формат прежней истории (PrintJob), чтобы старые экраны работали. */
export function toHistoryJob(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    kind: r.kind,
    status: r.status,
    quantity: r.filled,
    blank: r.blank,
    user: r.user || '',
    agent: r.agent || undefined,
    via: r.status === 'browser' ? 'browser' : 'queue',
    error: r.error,
    dish: { id: r.dish_id, name: r.dish_name },
    labelDate: r.label_date,
    labelTime: r.label_time,
    labelSize: r.label_size,
    variant: r.variant,
  };
}
