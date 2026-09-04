#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderJob } from './render.js';
import { buildPdf } from './pdf.js';
import { printPdf, listPrinters } from './print.js';
import { runSync } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// --- дублируем консоль в файл out/agent.log (для скрытого автозапуска) ---
try {
  const logDir = path.join(ROOT, 'out');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'agent.log');
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 3 * 1024 * 1024) fs.rmSync(logFile);
  } catch {}
  const stream = fs.createWriteStream(logFile, { flags: 'a' });
  const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  for (const m of ['log', 'warn', 'error']) {
    const orig = console[m].bind(console);
    console[m] = (...a) => {
      orig(...a);
      try {
        stream.write(`[${stamp()}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);
      } catch {}
    };
  }
} catch {
  /* no-op */
}

function loadConfig() {
  const p = process.env.AGENT_CONFIG || path.join(ROOT, 'agent-config.json');
  if (!fs.existsSync(p)) {
    console.error(`\n  Нет файла конфигурации: ${p}`);
    console.error('  Скопируйте agent-config.example.json → agent-config.json и заполните.\n');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.apiBase = String(cfg.apiBase || '').replace(/\/$/, '');
  cfg.pollMs = Number(cfg.pollMs) || 2000;
  cfg.helloMs = Number(cfg.helloMs) || 15000;
  cfg.name = cfg.name || 'agent';
  if (!cfg.apiBase) throw new Error('agent-config.json: не задан apiBase');
  return cfg;
}

const cfg = loadConfig();
const API = (p) => `${cfg.apiBase}/api${p}`;
const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.agentToken || ''}` };

async function jfetch(url, init) {
  const res = await fetch(url, { ...init, headers: { ...authHeaders, ...(init?.headers || {}) } });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status} ${url}`);
  return data;
}
let printersCache = [];
let lastSyncAt = null;
async function sayHello() {
  try {
    printersCache = await listPrinters();
    await jfetch(API('/agent/hello'), {
      method: 'POST',
      body: JSON.stringify({
        agent: cfg.name,
        platform: process.platform,
        printers: printersCache,
        version: '2.1.0',
        lastSyncAt,
        iikoConfigured: !!(cfg.iiko && cfg.iiko.host && cfg.iiko.login),
      }),
    });
  } catch (e) {
    console.warn('hello:', e.message);
  }
}

async function getSettings() {
  try {
    return (await jfetch(API('/settings'))).settings || {};
  } catch {
    return {};
  }
}

/* --------------------------------- печать --------------------------------- */

async function processPrintJob(job) {
  const printer = cfg.printerName || job.render?.printerName || undefined;
  const dryRun = cfg.dryRun || !!job.render?.dryRun;
  console.log(`→ задание #${job.id} [${job.kind}] ${job.dish?.name || ''} ×${job.quantity || 1}`);
  try {
    await jfetch(API(`/jobs/${job.id}/claim`), { method: 'POST', body: JSON.stringify({ agent: cfg.name }) });
  } catch (e) {
    console.log(`  пропуск: ${e.message}`);
    return;
  }
  let result;
  try {
    const png = await renderJob(job);
    const pdf = await buildPdf(png.buffer, {
      widthMm: png.widthMm,
      heightMm: png.heightMm,
      copies: job.quantity || 1,
      copiesMode: job.render?.copiesMode || 'pages',
    });
    result = await printPdf(pdf, {
      printer,
      copies: job.quantity || 1,
      copiesMode: job.render?.copiesMode || 'pages',
      scale: job.render?.scale || 'noscale',
      dryRun,
      tag: `job${job.id}`,
    });
  } catch (e) {
    result = { ok: false, via: 'render', error: String(e?.message || e) };
  }
  try {
    await jfetch(API(`/jobs/${job.id}/complete`), {
      method: 'POST',
      body: JSON.stringify({ ok: result.ok, via: result.via, error: result.error || null }),
    });
  } catch (e) {
    console.warn('  complete:', e.message);
  }
  console.log(`  ${result.ok ? '✓' : '✗'} ${result.via}${result.error ? ' — ' + result.error : ''}`);
}

/* ------------------------------ синхронизация ------------------------------ */

let syncing = false;
async function doSync(jobId, settings) {
  if (syncing) return;
  syncing = true;
  try {
    if (jobId) {
      try {
        await jfetch(API(`/jobs/${jobId}/claim`), { method: 'POST', body: JSON.stringify({ agent: cfg.name }) });
      } catch (e) {
        console.log(`  синхронизация: задание уже занято (${e.message})`);
        return;
      }
    }
    const s = settings || (await getSettings());
    console.log('→ синхронизация с iiko…');
    let ok = true;
    let err = null;
    const push = (p, init) => jfetch(API(p), init);
    try {
      const res = await runSync(cfg, push, s, (lvl, m) => console.log(`  [iiko] ${m}`));
      lastSyncAt = new Date().toISOString();
      console.log(`  ✓ синхронизация: ${JSON.stringify(res).slice(0, 220)}`);
    } catch (e) {
      ok = false;
      err = String(e?.message || e);
      console.warn('  ✗ синхронизация:', err);
    }
    if (jobId) {
      await jfetch(API(`/jobs/${jobId}/complete`), {
        method: 'POST',
        body: JSON.stringify({ ok, via: 'iiko-sync', error: err }),
      }).catch(() => {});
    }
  } finally {
    syncing = false;
  }
}

/* -------------------------------- главный цикл -------------------------------- */

let working = false;
async function tick() {
  if (working) return;
  working = true;
  try {
    const { jobs } = await jfetch(API('/jobs?status=queued'));
    for (const job of jobs.sort((a, b) => a.id - b.id)) {
      if (job.kind === 'sync') await doSync(job.id);
      else await processPrintJob(job);
    }
  } catch (e) {
    process.stdout.write('. ');
  } finally {
    working = false;
  }
}

let lastScheduledSync = 0;
async function syncScheduler() {
  const s = await getSettings();
  if (s['sync.enabled'] === false) return;
  if (!(cfg.iiko && cfg.iiko.host)) return;
  const everyMs = Math.max(1, Number(s['sync.everyHours']) || 6) * 3600 * 1000;
  if (Date.now() - lastScheduledSync >= everyMs) {
    lastScheduledSync = Date.now();
    await doSync(null, s);
  }
}

console.log(`\n  GOFOOD Print Agent  ·  ${cfg.name}`);
console.log(`  API:      ${cfg.apiBase}`);
console.log(`  Принтер:  ${cfg.printerName || '(из настроек сайта / по умолчанию)'}`);
console.log(`  iiko:     ${cfg.iiko && cfg.iiko.host ? cfg.iiko.host : 'не настроен'}`);
console.log(`  Опрос:    каждые ${cfg.pollMs} мс${cfg.dryRun ? '  ·  ТЕСТ-РЕЖИМ (без печати)' : ''}\n`);

await sayHello();
setInterval(sayHello, cfg.helloMs);
setInterval(tick, cfg.pollMs);
setInterval(syncScheduler, 60 * 1000); // раз в минуту проверяем, не пора ли синхронизировать
tick();
setTimeout(syncScheduler, 8000); // первая синхронизация через 8 c после старта
