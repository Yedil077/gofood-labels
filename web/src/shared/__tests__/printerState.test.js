import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readiness, waitReason, printerHealth, normalizeRoll } from '../printerState.js';
import { getProfiles, profileById, DEFAULT_PROFILES } from '../labelSizes.js';

const settings = {}; // профили по умолчанию

test('профили по умолчанию: 80×50 готов (рабочая конфигурация), остальные не проверены', () => {
  const p = getProfiles(settings);
  assert.deepEqual(p.map((x) => [x.code, x.ready]), [
    ['LABEL_80x50', true],
    ['LABEL_100x70', false],
    ['ROUND_50', false],
    ['ROUND_60', false],
  ]);
  const m = profileById(settings, '80x50').media;
  assert.deepEqual([m.widthMm, m.lengthMm, m.gapMm], [50, 80, 3], 'драйвер: ширина 50, длина 80, зазор 3');
  assert.equal(profileById(settings, '80x50').orientation, 'auto', 'поворот оставляем SumatraPDF, как работает сейчас');
});

test('новый формат добавляется настройками, без кода', () => {
  const s = { 'print.profiles': [...DEFAULT_PROFILES, { id: '58x40', title: '58 × 40 мм', widthMm: 58, heightMm: 40, ready: true, windowsPrinter: 'EPSON CW-C4030 58x40' }] };
  const p = profileById(s, '58x40');
  assert.equal(p.shape, 'rect');
  assert.equal(p.windowsPrinter, 'EPSON CW-C4030 58x40');
  assert.equal(profileById(s, 'r60').shape, 'round');
});

test('рулон по умолчанию — 80×50, источник «по умолчанию», не «авто»', () => {
  assert.deepEqual(normalizeRoll(null), { id: '80x50', source: 'default', by: null, at: null });
});

test('готовность к печати', () => {
  const ok = { status: 'Normal', workOffline: false };
  assert.equal(readiness({ settings, roll: null, online: true, printer: ok }).canPrint, true);
  assert.match(readiness({ settings, roll: null, online: false, printer: ok }).reason, /не на связи/);
  assert.match(readiness({ settings, roll: { id: 'r50' }, online: true, printer: ok }).reason, /не проверен/);
  assert.match(readiness({ settings, roll: null, online: true, printer: { status: 'Normal', workOffline: true } }).reason, /офлайн/);
  assert.equal(readiness({ settings, roll: null, online: true, printer: null }).canPrint, true, 'статус неизвестен — не блокируем');
});

test('почему задание ждёт', () => {
  const q = (size) => ({ status: 'queued', label_size: size });
  assert.equal(waitReason(q('80x50'), { settings, roll: null }), null);
  assert.equal(waitReason(q(null), { settings, roll: null }), null, 'старые записи — 80×50');
  assert.equal(waitReason(q('r60'), { settings, roll: null }), 'roll');
  assert.equal(waitReason(q('r60'), { settings, roll: { id: 'r60' } }), 'profile');
  assert.equal(waitReason({ status: 'done', label_size: 'r60' }, { settings, roll: null }), null);
});

test('состояние принтера Windows', () => {
  assert.equal(printerHealth({ status: 'Normal' }), 'ok');
  assert.equal(printerHealth({ status: 'Offline' }), 'offline');
  assert.equal(printerHealth({ status: 'PaperOut' }), 'error');
  assert.equal(printerHealth(null), 'unknown');
});
