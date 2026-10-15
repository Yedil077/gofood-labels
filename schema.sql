-- Cloudflare D1: хранилище в виде key-value (JSON в value).
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Очередь печати (общая для всех компьютеров кухни). Создаётся и автоматически при первом
-- запросе (ensureQueueSchema в web/src/shared/printQueue.js); здесь — для справки/миграции.
CREATE TABLE IF NOT EXISTS print_jobs (
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
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs (status, queued_at, id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created ON print_jobs (created_at);
