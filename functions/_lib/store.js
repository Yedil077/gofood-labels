/**
 * Хранилище на Cloudflare D1 в виде key-value: таблица kv(key PRIMARY KEY, value TEXT JSON).
 * API совпадает с прежним (Netlify Blobs), чтобы роутер не менялся.
 */

let DB = null;

/** Вызывается в начале каждого запроса: onRequest(context) -> initStore(context.env) */
export function initStore(env) {
  DB = (env && (env.GOFOOD_DB || env.DB)) || null;
}

/** Прямой доступ к D1 (очередь печати — отдельная таблица print_jobs). */
export function getDB() {
  requireDB();
  return DB;
}

function requireDB() {
  if (!DB) throw new Error('D1 binding GOFOOD_DB не настроен (wrangler.toml / Pages → Settings → Functions → D1)');
}

function cloneSafe(v) {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v ?? null));
  }
}

export async function getJSON(key, fallback) {
  try {
    requireDB();
    const row = await DB.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first();
    if (!row || row.value == null) return fallback;
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export async function setJSON(key, value) {
  requireDB();
  await DB.prepare('INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2')
    .bind(key, JSON.stringify(value))
    .run();
  return value;
}

/** read-modify-write (без межзапросных транзакций; для одной кухни конкуренция минимальна) */
export async function updateJSON(key, mutate, fallback) {
  const cur = await getJSON(key, fallback);
  const next = await mutate(cloneSafe(cur));
  await setJSON(key, next);
  return next;
}

/* ---- задания печати: ключи job/<id> ---- */

export async function listJobs() {
  try {
    requireDB();
    const { results } = await DB.prepare("SELECT value FROM kv WHERE key LIKE 'job/%'").all();
    const out = (results || [])
      .map((r) => {
        try {
          return JSON.parse(r.value);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  } catch {
    return [];
  }
}

export function getJob(id) {
  return getJSON(`job/${id}`, null);
}

export async function putJob(job) {
  await setJSON(`job/${job.id}`, job);
  return job;
}

export async function deleteJob(id) {
  try {
    requireDB();
    await DB.prepare('DELETE FROM kv WHERE key = ?').bind(`job/${id}`).run();
  } catch {
    /* no-op */
  }
}

export async function trimJobs(keep = 200) {
  const jobs = await listJobs();
  for (const j of jobs.slice(keep)) await deleteJob(j.id);
}
