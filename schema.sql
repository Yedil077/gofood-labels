-- Cloudflare D1: хранилище в виде key-value (JSON в value).
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
