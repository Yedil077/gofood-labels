import { getStore } from '@netlify/blobs';

const STORE = 'gofood';

export function store() {
  return getStore(STORE);
}

export async function getJSON(key, fallback) {
  try {
    const v = await store().get(key, { type: 'json' });
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function setJSON(key, value) {
  await store().setJSON(key, value);
  return value;
}

/**
 * Чтение-изменение-запись с оптимистичной блокировкой по etag.
 * Повторяет до 5 раз при конкурентной записи.
 */
export async function updateJSON(key, mutate, fallback) {
  const s = store();
  for (let attempt = 0; attempt < 6; attempt++) {
    let etag;
    let current = fallback;
    try {
      const res = await s.getWithMetadata(key, { type: 'json' });
      if (res) {
        current = res.data ?? fallback;
        etag = res.etag;
      }
    } catch {
      current = fallback;
    }
    const next = await mutate(structuredCloneSafe(current));
    try {
      if (etag) await s.setJSON(key, next, { onlyIfMatch: etag });
      else await s.setJSON(key, next, { onlyIfNew: true });
      return next;
    } catch (e) {
      // конфликт версий — пробуем снова; на последней попытке пишем без условия
      if (attempt === 5) {
        await s.setJSON(key, next);
        return next;
      }
    }
  }
}

function structuredCloneSafe(v) {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v ?? null));
  }
}

/* ---- задания печати: по одному блобу на задание, префикс job/ ---- */

export async function listJobs() {
  const s = store();
  const out = [];
  try {
    const { blobs } = await s.list({ prefix: 'job/' });
    for (const b of blobs) {
      const j = await s.get(b.key, { type: 'json' });
      if (j) out.push(j);
    }
  } catch {
    /* пусто */
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export async function getJob(id) {
  return getJSON(`job/${id}`, null);
}

export async function putJob(job) {
  await store().setJSON(`job/${job.id}`, job);
  return job;
}

export async function deleteJob(id) {
  try {
    await store().delete(`job/${id}`);
  } catch {
    /* no-op */
  }
}

/** Оставляет только последние N заданий (по дате), старые удаляет. */
export async function trimJobs(keep = 200) {
  const jobs = await listJobs();
  const stale = jobs.slice(keep);
  for (const j of stale) await deleteJob(j.id);
}
