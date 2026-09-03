#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderJob } from './render.js';
import { buildPdf } from './pdf.js';
import { printPdf, listPrinters } from './print.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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
async function sayHello() {
  try {
    printersCache = await listPrinters();
    await jfetch(API('/agent/hello'), {
      method: 'POST',
      body: JSON.stringify({
        agent: cfg.name,
        platform: process.platform,
        printers: printersCache,
        version: '2.0.0',
      }),
    });
  } catch (e) {
    console.warn('hello:', e.message);
  }
}

async function processJob(job) {
  const printer = cfg.printerName || job.render?.printerName || undefined;
  const dryRun = cfg.dryRun || !!job.render?.dryRun;
  console.log(`→ задание #${job.id} [${job.kind}] ${job.dish?.name || ''} ×${job.quantity || 1}`);

  try {
    await jfetch(API(`/jobs/${job.id}/claim`), {
      method: 'POST',
      body: JSON.stringify({ agent: cfg.name }),
    });
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

let working = false;
async function tick() {
  if (working) return;
  working = true;
  try {
    const { jobs } = await jfetch(API('/jobs?status=queued'));
    for (const job of jobs.sort((a, b) => a.id - b.id)) await processJob(job);
  } catch (e) {
    process.stdout.write(`. `); // тихий ретрай при недоступности сети
  } finally {
    working = false;
  }
}

console.log(`\n  GOFOOD Print Agent  ·  ${cfg.name}`);
console.log(`  API:      ${cfg.apiBase}`);
console.log(`  Принтер:  ${cfg.printerName || '(из настроек сайта / по умолчанию)'}`);
console.log(`  Опрос:    каждые ${cfg.pollMs} мс${cfg.dryRun ? '  ·  ТЕСТ-РЕЖИМ (без печати)' : ''}\n`);

await sayHello();
setInterval(sayHello, cfg.helloMs);
setInterval(tick, cfg.pollMs);
tick();
