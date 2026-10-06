import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printVariantById } from '../printVariants.js';
import { normalizeDishForLabel } from '../normalize.js';

const settings = { 'label.timeMode': 'ticket', 'storage.text': 'Хранить в холодильнике.' };
const dt = { date: '', time: '', now: '2026-10-06 10:00' };

test('вариант по id: неизвестный — «Обычный»', () => {
  assert.equal(printVariantById('aidar').shelfHours, 72);
  assert.equal(printVariantById('xxx').id, 'standard');
  assert.equal(printVariantById(undefined).shelfHours, undefined);
});

test('«Айдар»: 72 часа у всех блюд, «Обычный» — по категории', () => {
  const hot = { name: 'Вок', category: 'Горячее из говядины' };
  const std = normalizeDishForLabel(hot, settings, dt);
  const aid = normalizeDishForLabel(hot, settings, dt, { shelfHours: printVariantById('aidar').shelfHours });
  assert.equal(std.shelfHours, 48);
  assert.equal(aid.shelfHours, 72);
  assert.match(aid.storageText, /Срок хранения 72 часа\./);
  // остальное не меняется
  assert.equal(aid.timeStr, std.timeStr);
  assert.equal(aid.dateStr, std.dateStr);
});
